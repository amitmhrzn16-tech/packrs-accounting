/**
 * DMS Database helpers using raw SQL.
 * This avoids needing `prisma generate` for the new DMS tables.
 * Works directly with SQLite via prisma.$executeRawUnsafe / $queryRawUnsafe.
 */

import { prisma } from "@/lib/prisma";

// ─── AUTO-MIGRATION ────────────────────────────────────────

let migrated = false;

export async function ensureDmsTables() {
  if (migrated) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dms_sync_configs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL UNIQUE,
      dms_base_url TEXT NOT NULL,
      dms_username TEXT NOT NULL,
      dms_password TEXT NOT NULL,
      branch_id TEXT NOT NULL DEFAULT '1',
      branch_name TEXT NOT NULL DEFAULT 'Head Office',
      sync_enabled INTEGER NOT NULL DEFAULT 1,
      sync_frequency TEXT NOT NULL DEFAULT 'daily',
      last_sync_at TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dms_sync_logs (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      sync_date TEXT NOT NULL,
      income_count INTEGER NOT NULL DEFAULT 0,
      expense_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      new_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (config_id) REFERENCES dms_sync_configs(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dms_synced_transactions (
      id TEXT PRIMARY KEY,
      sync_log_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      dms_type TEXT NOT NULL,
      dms_date TEXT NOT NULL,
      dms_account TEXT NOT NULL,
      dms_category TEXT,
      dms_particulars TEXT,
      dms_amount REAL NOT NULL,
      dms_branch TEXT NOT NULL,
      match_status TEXT NOT NULL,
      transaction_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sync_log_id) REFERENCES dms_sync_logs(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    )
  `);

  migrated = true;
}

// ─── HELPER: generate cuid-like ID ────────────────────────

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const timestamp = Date.now().toString(36);
  let random = "";
  for (let i = 0; i < 12; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `dms${timestamp}${random}`;
}

// ─── DMS SYNC CONFIG CRUD ──────────────────────────────────

export interface DmsSyncConfigRow {
  id: string;
  company_id: string;
  dms_base_url: string;
  dms_username: string;
  dms_password: string;
  branch_id: string;
  branch_name: string;
  sync_enabled: number; // SQLite boolean: 0 or 1
  sync_frequency: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getConfigByCompany(
  companyId: string
): Promise<DmsSyncConfigRow | null> {
  await ensureDmsTables();
  const rows = await prisma.$queryRawUnsafe<DmsSyncConfigRow[]>(
    `SELECT * FROM dms_sync_configs WHERE company_id = ?`,
    companyId
  );
  return rows[0] || null;
}

export async function upsertConfig(
  companyId: string,
  data: {
    dmsBaseUrl: string;
    dmsUsername: string;
    dmsPassword?: string;
    branchId?: string;
    branchName?: string;
    syncEnabled?: boolean;
    syncFrequency?: string;
  }
): Promise<DmsSyncConfigRow> {
  await ensureDmsTables();

  const existing = await getConfigByCompany(companyId);

  if (existing) {
    // Update
    const password =
      data.dmsPassword && data.dmsPassword.length > 0
        ? data.dmsPassword
        : existing.dms_password;

    await prisma.$executeRawUnsafe(
      `UPDATE dms_sync_configs SET
        dms_base_url = ?,
        dms_username = ?,
        dms_password = ?,
        branch_id = ?,
        branch_name = ?,
        sync_enabled = ?,
        sync_frequency = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
      data.dmsBaseUrl.replace(/\/$/, ""),
      data.dmsUsername,
      password,
      data.branchId || existing.branch_id,
      data.branchName || existing.branch_name,
      data.syncEnabled !== undefined ? (data.syncEnabled ? 1 : 0) : existing.sync_enabled,
      data.syncFrequency || existing.sync_frequency,
      existing.id
    );

    return (await getConfigByCompany(companyId))!;
  } else {
    // Create
    if (!data.dmsPassword) {
      throw new Error("Password is required for initial setup");
    }

    const id = generateId();
    await prisma.$executeRawUnsafe(
      `INSERT INTO dms_sync_configs (id, company_id, dms_base_url, dms_username, dms_password, branch_id, branch_name, sync_enabled, sync_frequency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      companyId,
      data.dmsBaseUrl.replace(/\/$/, ""),
      data.dmsUsername,
      data.dmsPassword,
      data.branchId || "1",
      data.branchName || "Head Office",
      data.syncEnabled !== undefined ? (data.syncEnabled ? 1 : 0) : 1,
      data.syncFrequency || "daily"
    );

    return (await getConfigByCompany(companyId))!;
  }
}

// ─── DMS SYNC LOG CRUD ────────────────────────────────────

export interface DmsSyncLogRow {
  id: string;
  config_id: string;
  sync_type: string;
  status: string;
  sync_date: string;
  income_count: number;
  expense_count: number;
  matched_count: number;
  new_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export async function createSyncLog(
  configId: string,
  syncType: string,
  syncDate: string
): Promise<string> {
  await ensureDmsTables();
  const id = generateId();
  await prisma.$executeRawUnsafe(
    `INSERT INTO dms_sync_logs (id, config_id, sync_type, status, sync_date)
     VALUES (?, ?, ?, 'running', ?)`,
    id,
    configId,
    syncType,
    syncDate
  );
  return id;
}

export async function updateSyncLog(
  id: string,
  data: {
    status?: string;
    incomeCount?: number;
    expenseCount?: number;
    matchedCount?: number;
    newCount?: number;
    errorMessage?: string | null;
    completedAt?: string;
  }
) {
  await ensureDmsTables();

  const sets: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) { sets.push("status = ?"); values.push(data.status); }
  if (data.incomeCount !== undefined) { sets.push("income_count = ?"); values.push(data.incomeCount); }
  if (data.expenseCount !== undefined) { sets.push("expense_count = ?"); values.push(data.expenseCount); }
  if (data.matchedCount !== undefined) { sets.push("matched_count = ?"); values.push(data.matchedCount); }
  if (data.newCount !== undefined) { sets.push("new_count = ?"); values.push(data.newCount); }
  if (data.errorMessage !== undefined) { sets.push("error_message = ?"); values.push(data.errorMessage); }
  if (data.completedAt !== undefined) { sets.push("completed_at = ?"); values.push(data.completedAt); }

  if (sets.length === 0) return;

  values.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE dms_sync_logs SET ${sets.join(", ")} WHERE id = ?`,
    ...values
  );
}

export async function getSyncLogs(
  configId: string,
  limit = 20,
  offset = 0
): Promise<{ logs: DmsSyncLogRow[]; total: number }> {
  await ensureDmsTables();

  const logs = await prisma.$queryRawUnsafe<DmsSyncLogRow[]>(
    `SELECT * FROM dms_sync_logs WHERE config_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    configId,
    limit,
    offset
  );

  const countResult = await prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*) as count FROM dms_sync_logs WHERE config_id = ?`,
    configId
  );

  return { logs, total: Number(countResult[0]?.count || 0) };
}

// ─── DMS SYNCED TRANSACTION CRUD ──────────────────────────

export async function findExistingSyncedTxn(
  companyId: string,
  dmsType: string,
  dmsDate: string,
  dmsAmount: number,
  dmsParticulars: string | null,
  dmsAccount: string
): Promise<boolean> {
  await ensureDmsTables();

  let query = `SELECT COUNT(*) as count FROM dms_synced_transactions
    WHERE company_id = ? AND dms_type = ? AND dms_date = ? AND dms_amount = ? AND dms_account = ?
    AND match_status IN ('matched', 'new')`;
  const params: any[] = [companyId, dmsType, dmsDate, dmsAmount, dmsAccount];

  if (dmsParticulars) {
    query += ` AND dms_particulars = ?`;
    params.push(dmsParticulars);
  }

  const result = await prisma.$queryRawUnsafe<[{ count: number }]>(query, ...params);
  return Number(result[0]?.count || 0) > 0;
}

export async function createSyncedTxn(data: {
  syncLogId: string;
  companyId: string;
  dmsType: string;
  dmsDate: string;
  dmsAccount: string;
  dmsCategory: string | null;
  dmsParticulars: string | null;
  dmsAmount: number;
  dmsBranch: string;
  matchStatus: string;
  transactionId: string | null;
}): Promise<string> {
  await ensureDmsTables();
  const id = generateId();
  await prisma.$executeRawUnsafe(
    `INSERT INTO dms_synced_transactions
      (id, sync_log_id, company_id, dms_type, dms_date, dms_account, dms_category, dms_particulars, dms_amount, dms_branch, match_status, transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    data.syncLogId,
    data.companyId,
    data.dmsType,
    data.dmsDate,
    data.dmsAccount,
    data.dmsCategory,
    data.dmsParticulars,
    data.dmsAmount,
    data.dmsBranch,
    data.matchStatus,
    data.transactionId
  );
  return id;
}

export async function updateConfigLastSync(configId: string) {
  await ensureDmsTables();
  await prisma.$executeRawUnsafe(
    `UPDATE dms_sync_configs SET last_sync_at = ?, updated_at = datetime('now') WHERE id = ?`,
    new Date().toISOString(),
    configId
  );
}

export async function getAllEnabledConfigs(): Promise<DmsSyncConfigRow[]> {
  await ensureDmsTables();
  return prisma.$queryRawUnsafe<DmsSyncConfigRow[]>(
    `SELECT c.*, comp.name as company_name FROM dms_sync_configs c
     JOIN companies comp ON comp.id = c.company_id
     WHERE c.sync_enabled = 1`
  );
}
