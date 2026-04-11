import { prisma } from "@/lib/prisma";

/**
 * Universal entry log utility — records every action on any module entry.
 * Used for audit trail across income, expense, daily_cash, salary, advance, intercompany, contra, etc.
 */

function logId() {
  return "el" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type LogModule = "income" | "expense" | "daily_cash" | "salary" | "advance" | "intercompany" | "contra" | "reconciliation" | "staff";
export type LogAction = "created" | "edited" | "deleted" | "approved" | "rejected" | "recovered";

interface LogEntryParams {
  companyId: string;
  module: LogModule;
  entryId: string;
  action: LogAction;
  performedBy: string;
  performedByName?: string;
  fieldChanges?: Record<string, { old: any; new: any }>;
  notes?: string;
}

export async function createEntryLog(params: LogEntryParams) {
  const { companyId, module, entryId, action, performedBy, performedByName, fieldChanges, notes } = params;
  const id = logId();
  const now = new Date().toISOString();
  const changesJson = fieldChanges ? JSON.stringify(fieldChanges).replace(/'/g, "''") : "";
  const safeNotes = (notes || "").replace(/'/g, "''");
  const safeName = (performedByName || "").replace(/'/g, "''");

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO entry_logs (id, company_id, module, entry_id, action, field_changes, performed_by, performed_by_name, notes, created_at)
       VALUES ('${id}', '${companyId}', '${module}', '${entryId}', '${action}', '${changesJson}', '${performedBy}', '${safeName}', '${safeNotes}', '${now}')`
    );
  } catch (err) {
    console.error("Failed to create entry log:", err);
  }
  return id;
}

/**
 * Fetch logs for a specific entry
 */
export async function getEntryLogs(module: LogModule, entryId: string) {
  try {
    const logs: any[] = await prisma.$queryRawUnsafe(
      `SELECT el.*, u.name as user_name, u.email as user_email
       FROM entry_logs el
       LEFT JOIN users u ON u.id = el.performed_by
       WHERE el.module = ? AND el.entry_id = ?
       ORDER BY el.created_at DESC`,
      module,
      entryId
    );
    return logs.map((l: any) => ({
      id: l.id,
      action: l.action,
      fieldChanges: l.field_changes ? JSON.parse(l.field_changes) : null,
      performedBy: l.performed_by,
      performedByName: l.performed_by_name || l.user_name || "Unknown",
      notes: l.notes,
      createdAt: l.created_at,
    }));
  } catch (err) {
    console.error("Failed to get entry logs:", err);
    return [];
  }
}

/**
 * Fetch all logs for a company (paginated)
 */
export async function getCompanyLogs(companyId: string, limit = 50, offset = 0) {
  try {
    const logs: any[] = await prisma.$queryRawUnsafe(
      `SELECT el.*, u.name as user_name
       FROM entry_logs el
       LEFT JOIN users u ON u.id = el.performed_by
       WHERE el.company_id = ?
       ORDER BY el.created_at DESC
       LIMIT ? OFFSET ?`,
      companyId,
      limit,
      offset
    );
    return logs.map((l: any) => ({
      id: l.id,
      module: l.module,
      entryId: l.entry_id,
      action: l.action,
      fieldChanges: l.field_changes ? JSON.parse(l.field_changes) : null,
      performedByName: l.performed_by_name || l.user_name || "Unknown",
      notes: l.notes,
      createdAt: l.created_at,
    }));
  } catch (err) {
    console.error("Failed to get company logs:", err);
    return [];
  }
}

/**
 * Check if user has permission for a specific action on a module
 */
export async function checkModulePermission(
  companyId: string,
  userId: string,
  module: string,
  action: "view" | "add" | "edit" | "delete" | "comment" | "approve"
): Promise<boolean> {
  try {
    // First check if any permissions are configured for this company
    const permCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as cnt FROM module_permissions WHERE company_id = ?`,
      companyId
    );

    // If no permissions configured yet, fall back to role-based defaults
    if (Number(permCount[0]?.cnt || 0) === 0) {
      return true; // No restrictions configured = allow all
    }

    const fieldMap: Record<string, string> = {
      view: "can_view",
      add: "can_add",
      edit: "can_edit",
      delete: "can_delete",
      comment: "can_comment",
      approve: "can_approve",
    };
    const field = fieldMap[action];
    if (!field) return false;

    const perm: any[] = await prisma.$queryRawUnsafe(
      `SELECT ${field} as allowed FROM module_permissions WHERE company_id = ? AND user_id = ? AND module = ?`,
      companyId,
      userId,
      module
    );

    if (perm.length === 0) return false; // Permission record missing = no access
    return Number(perm[0].allowed) === 1;
  } catch (err) {
    console.error("Permission check error:", err);
    return true; // Fail open on errors to avoid locking users out
  }
}
