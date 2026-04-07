/**
 * DMS Sync Service - Handles matching DMS transactions with existing
 * accounting records and importing new ones.
 *
 * Uses raw SQL (via dms-db.ts) to avoid needing Prisma client regeneration.
 */

import { prisma } from "@/lib/prisma";
import {
  dmsLogin,
  dmsFetchAllData,
  type DmsTransaction,
} from "./dms-client";
import {
  getConfigByCompany,
  createSyncLog,
  updateSyncLog,
  updateConfigLastSync,
  findExistingSyncedTxn,
  createSyncedTxn,
} from "./dms-db";

export interface SyncResult {
  success: boolean;
  syncLogId: string;
  income: { fetched: number; matched: number; new: number };
  expense: { fetched: number; matched: number; new: number };
  errors: string[];
}

/**
 * Map DMS account names to payment methods used in Packrs Accounting
 */
function mapAccountToPaymentMethod(dmsAccount: string): string {
  const lower = dmsAccount.toLowerCase();
  if (lower.includes("cash") || lower.includes("petty")) return "cash";
  if (lower.includes("bank") || lower.includes("laxmi") || lower.includes("nabil")) return "bank";
  if (lower.includes("esewa")) return "esewa";
  if (lower.includes("khalti")) return "khalti";
  if (lower.includes("online") || lower.includes("qr")) return "bank";
  if (lower.includes("due")) return "bank";
  return "cash";
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

async function findOrCreateCategory(
  companyId: string,
  categoryName: string,
  type: "income" | "expense"
): Promise<string | null> {
  if (!categoryName) return null;

  const allCategories = await prisma.category.findMany({
    where: { companyId, type, isActive: true },
  });

  for (const cat of allCategories) {
    if (normalizeText(cat.name) === normalizeText(categoryName)) return cat.id;
    if (textSimilarity(cat.name, categoryName) > 0.6) return cat.id;
  }

  const newCat = await prisma.category.create({
    data: { companyId, name: categoryName, type, isActive: true },
  });
  return newCat.id;
}

async function findMatchingTransaction(
  companyId: string,
  dmsTxn: DmsTransaction
): Promise<{ id: string; confidence: number } | null> {
  const candidates = await prisma.transaction.findMany({
    where: {
      companyId,
      type: dmsTxn.type,
      date: dmsTxn.date,
      amount: { gte: dmsTxn.amount - 0.5, lte: dmsTxn.amount + 0.5 },
    },
  });

  if (candidates.length === 0) return null;

  let bestMatch: { id: string; confidence: number } | null = null;

  for (const candidate of candidates) {
    // Skip if this candidate is already linked from a previous sync
    if (candidate.source === "dms_sync") continue;

    let confidence = 0.5;

    if (candidate.particulars && dmsTxn.particulars) {
      confidence += textSimilarity(candidate.particulars, dmsTxn.particulars) * 0.3;
    }

    const expectedMethod = mapAccountToPaymentMethod(dmsTxn.account);
    if (candidate.paymentMethod === expectedMethod) confidence += 0.1;
    if (candidate.amount === dmsTxn.amount) confidence += 0.1;

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { id: candidate.id, confidence };
    }
  }

  return bestMatch && bestMatch.confidence >= 0.5 ? bestMatch : null;
}

async function getSystemUserId(companyId: string): Promise<string | null> {
  const companyUser = await prisma.companyUser.findFirst({
    where: { companyId, role: { in: ["company_admin", "accountant"] } },
  });
  return companyUser?.userId || null;
}

/**
 * Run a full sync for a company's DMS integration
 */
export async function runDmsSync(
  companyId: string,
  syncType: "manual" | "scheduled",
  fromDate?: string,
  toDate?: string,
  userId?: string
): Promise<SyncResult> {
  const errors: string[] = [];

  const config = await getConfigByCompany(companyId);

  if (!config) {
    return {
      success: false, syncLogId: "",
      income: { fetched: 0, matched: 0, new: 0 },
      expense: { fetched: 0, matched: 0, new: 0 },
      errors: ["DMS sync not configured for this company"],
    };
  }

  if (!config.sync_enabled && syncType === "scheduled") {
    return {
      success: false, syncLogId: "",
      income: { fetched: 0, matched: 0, new: 0 },
      expense: { fetched: 0, matched: 0, new: 0 },
      errors: ["DMS sync is disabled"],
    };
  }

  const today = new Date().toISOString().split("T")[0];
  const syncFrom = fromDate || today;
  const syncTo = toDate || today;

  const syncLogId = await createSyncLog(config.id, syncType, `${syncFrom} to ${syncTo}`);

  try {
    // Step 1: Login to DMS
    const loginResult = await dmsLogin(
      config.dms_base_url,
      config.dms_username,
      config.dms_password
    );

    if (!loginResult.success) {
      await updateSyncLog(syncLogId, {
        status: "failed",
        errorMessage: loginResult.error || "Login failed",
        completedAt: new Date().toISOString(),
      });
      return {
        success: false, syncLogId,
        income: { fetched: 0, matched: 0, new: 0 },
        expense: { fetched: 0, matched: 0, new: 0 },
        errors: [loginResult.error || "DMS login failed"],
      };
    }

    // Step 2: Fetch income + expense data
    const data = await dmsFetchAllData(
      config.dms_base_url,
      loginResult.cookies,
      syncFrom,
      syncTo,
      config.branch_id
    );

    errors.push(...data.income.errors, ...data.expense.errors);

    // Step 3: Process transactions
    const allDmsTransactions = [
      ...data.income.transactions,
      ...data.expense.transactions,
    ];

    let incomeMatched = 0, incomeNew = 0, expenseMatched = 0, expenseNew = 0;

    const systemUserId = userId || (await getSystemUserId(companyId));
    if (!systemUserId) {
      errors.push("No system user found for creating transactions");
      await updateSyncLog(syncLogId, {
        status: "failed",
        errorMessage: "No system user found",
        completedAt: new Date().toISOString(),
      });
      return {
        success: false, syncLogId,
        income: { fetched: data.income.totalFetched, matched: 0, new: 0 },
        expense: { fetched: data.expense.totalFetched, matched: 0, new: 0 },
        errors,
      };
    }

    for (const dmsTxn of allDmsTransactions) {
      try {
        // Check if already synced
        const alreadySynced = await findExistingSyncedTxn(
          companyId,
          dmsTxn.type,
          dmsTxn.date,
          dmsTxn.amount,
          dmsTxn.particulars || null,
          dmsTxn.account
        );

        if (alreadySynced) continue;

        // Try matching
        const match = await findMatchingTransaction(companyId, dmsTxn);

        if (match && match.confidence >= 0.5) {
          await createSyncedTxn({
            syncLogId,
            companyId,
            dmsType: dmsTxn.type,
            dmsDate: dmsTxn.date,
            dmsAccount: dmsTxn.account,
            dmsCategory: dmsTxn.category || null,
            dmsParticulars: dmsTxn.particulars || null,
            dmsAmount: dmsTxn.amount,
            dmsBranch: dmsTxn.branch,
            matchStatus: "matched",
            transactionId: match.id,
          });

          if (dmsTxn.type === "income") incomeMatched++;
          else expenseMatched++;
        } else {
          // Create new transaction
          const categoryId = await findOrCreateCategory(
            companyId,
            dmsTxn.category,
            dmsTxn.type
          );

          const newTxn = await prisma.transaction.create({
            data: {
              companyId,
              type: dmsTxn.type,
              amount: dmsTxn.amount,
              categoryId,
              particulars:
                dmsTxn.particulars ||
                `DMS ${dmsTxn.type}: ${dmsTxn.account}${dmsTxn.category ? " - " + dmsTxn.category : ""}`,
              date: dmsTxn.date,
              paymentMethod: mapAccountToPaymentMethod(dmsTxn.account),
              createdById: systemUserId,
              source: "dms_sync",
            },
          });

          await createSyncedTxn({
            syncLogId,
            companyId,
            dmsType: dmsTxn.type,
            dmsDate: dmsTxn.date,
            dmsAccount: dmsTxn.account,
            dmsCategory: dmsTxn.category || null,
            dmsParticulars: dmsTxn.particulars || null,
            dmsAmount: dmsTxn.amount,
            dmsBranch: dmsTxn.branch,
            matchStatus: "new",
            transactionId: newTxn.id,
          });

          if (dmsTxn.type === "income") incomeNew++;
          else expenseNew++;
        }
      } catch (txnError: any) {
        errors.push(
          `Error processing ${dmsTxn.type} ${dmsTxn.date} ${dmsTxn.amount}: ${txnError?.message}`
        );
      }
    }

    // Update sync log
    await updateSyncLog(syncLogId, {
      status: "completed",
      incomeCount: data.income.totalFetched,
      expenseCount: data.expense.totalFetched,
      matchedCount: incomeMatched + expenseMatched,
      newCount: incomeNew + expenseNew,
      completedAt: new Date().toISOString(),
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
    });

    await updateConfigLastSync(config.id);

    return {
      success: true,
      syncLogId,
      income: { fetched: data.income.totalFetched, matched: incomeMatched, new: incomeNew },
      expense: { fetched: data.expense.totalFetched, matched: expenseMatched, new: expenseNew },
      errors,
    };
  } catch (error: any) {
    await updateSyncLog(syncLogId, {
      status: "failed",
      errorMessage: error?.message || "Unknown sync error",
      completedAt: new Date().toISOString(),
    });

    return {
      success: false, syncLogId,
      income: { fetched: 0, matched: 0, new: 0 },
      expense: { fetched: 0, matched: 0, new: 0 },
      errors: [error?.message || "Unknown sync error"],
    };
  }
}
