import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

async function verifyAccess(userId: string, companyId: string) {
  const result = await prisma.$queryRawUnsafe<
    Array<{ id: string; user_id: string; company_id: string; role: string }>
  >(
    `SELECT id, user_id, company_id, role FROM company_users WHERE user_id = ? AND company_id = ?`,
    userId,
    companyId
  );
  return result?.[0]
    ? { id: result[0].id, userId: result[0].user_id, companyId: result[0].company_id, role: result[0].role }
    : null;
}

interface RouteParams {
  params: {
    companyId: string;
  };
}

/**
 * GET /api/companies/[companyId]/bank-reconciliation?bankAccountId=xxx
 * Returns reconciliation sessions and optionally transactions for a specific account
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ensure is_reconciled column exists (self-healing migration)
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE transactions ADD COLUMN is_reconciled INTEGER DEFAULT 0`);
    } catch (_) {
      // Column already exists, ignore
    }

    const url = new URL(request.url);
    const bankAccountId = url.searchParams.get("bankAccountId");
    const paymentMethod = url.searchParams.get("paymentMethod") || "bank";

    // Get all reconciliation sessions for the company
    const reconciliations = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        bank_account_id: string;
        reconciliation_date: string;
        statement_balance: number;
        book_balance: number;
        difference: number;
        status: string;
        created_at: string;
        updated_at: string;
      }>
    >(
      `SELECT id, bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, created_at, updated_at
       FROM bank_reconciliation
       WHERE company_id = ?
       ORDER BY created_at DESC`,
      params.companyId
    );

    const formattedReconciliations = reconciliations.map((r) => ({
      id: r.id,
      bankAccountId: r.bank_account_id,
      reconciliationDate: r.reconciliation_date,
      statementBalance: r.statement_balance,
      bookBalance: r.book_balance,
      difference: r.difference,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    let unreconciled: any[] = [];

    // If bankAccountId is provided, fetch unreconciled transactions
    if (bankAccountId) {
      const pmFilter = paymentMethod
        ? `AND LOWER(payment_method) = LOWER('${paymentMethod.replace(/'/g, "''")}')`
        : "";
      unreconciled = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          date: string;
          type: string;
          amount: number;
          particulars: string | null;
          payment_method: string | null;
          is_reconciled: number;
        }>
      >(
        `SELECT id, date, type, amount, particulars, payment_method, COALESCE(is_reconciled, 0) as is_reconciled
         FROM transactions
         WHERE company_id = ? ${pmFilter} AND (bank_account_id = ? OR bank_account_id IS NULL)
         ORDER BY date DESC`,
        params.companyId,
        bankAccountId
      );
    }

    const formattedUnreconciled = unreconciled.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      particulars: t.particulars,
      paymentMethod: t.payment_method,
      isReconciled: t.is_reconciled === 1,
    }));

    return NextResponse.json({
      reconciliations: formattedReconciliations,
      unreconciledTransactions: formattedUnreconciled,
    });
  } catch (error) {
    console.error("Get bank reconciliation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[companyId]/bank-reconciliation
 * Create a new reconciliation session
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access || access.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { bankAccountId, reconciliationDate, statementBalance } = body;

    if (!bankAccountId || !reconciliationDate || statementBalance === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: bankAccountId, reconciliationDate, statementBalance" },
        { status: 400 }
      );
    }

    // Calculate book balance from transactions for this account
    const bookBalanceResult = await prisma.$queryRawUnsafe<
      Array<{ total: number }>
    >(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
       FROM transactions
       WHERE company_id = ? AND bank_account_id = ? AND is_reconciled = 1`,
      params.companyId,
      bankAccountId
    );

    // Get opening balance
    const accountResult = await prisma.$queryRawUnsafe<
      Array<{ opening_balance: number }>
    >(
      `SELECT opening_balance FROM bank_accounts WHERE id = ? AND company_id = ?`,
      bankAccountId,
      params.companyId
    );

    const openingBalance = Number(accountResult?.[0]?.opening_balance) || 0;
    const totalTransactions = Number(bookBalanceResult?.[0]?.total) || 0;
    const bookBalance = openingBalance + totalTransactions;
    const difference = statementBalance - bookBalance;

    const reconciliationId = randomUUID();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_reconciliation (id, company_id, bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      reconciliationId,
      params.companyId,
      bankAccountId,
      reconciliationDate,
      statementBalance,
      bookBalance,
      difference,
      "draft",
      now,
      now
    );

    return NextResponse.json({
      id: reconciliationId,
      bankAccountId,
      reconciliationDate,
      statementBalance,
      bookBalance,
      difference,
      status: "draft",
    });
  } catch (error) {
    console.error("Create bank reconciliation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/companies/[companyId]/bank-reconciliation
 * Handle reconciliation actions
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access || access.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { action, transactionId, bankAccountId, reconciliationId } = body;

    // ─── RECONCILE TRANSACTION ─────────────────────────────────
    if (action === "reconcile_txn") {
      if (!transactionId || !bankAccountId) {
        return NextResponse.json(
          { error: "transactionId and bankAccountId required" },
          { status: 400 }
        );
      }

      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET is_reconciled = 1, bank_account_id = ? WHERE id = ?`,
        bankAccountId,
        transactionId
      );

      return NextResponse.json({ success: true, action: "reconciled" });
    }

    // ─── UNRECONCILE TRANSACTION ──────────────────────────────
    if (action === "unreconcile_txn") {
      if (!transactionId) {
        return NextResponse.json(
          { error: "transactionId required" },
          { status: 400 }
        );
      }

      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET is_reconciled = 0, bank_account_id = NULL WHERE id = ?`,
        transactionId
      );

      return NextResponse.json({ success: true, action: "unreconciled" });
    }

    // ─── COMPLETE RECONCILIATION ──────────────────────────────
    if (action === "complete") {
      if (!reconciliationId) {
        return NextResponse.json(
          { error: "reconciliationId required" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      const result = await prisma.$executeRawUnsafe(
        `UPDATE bank_reconciliation SET status = ?, updated_at = ? WHERE id = ?`,
        "completed",
        now,
        reconciliationId
      );

      if (result === 0) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      const reconciliation = await prisma.$queryRawUnsafe<
        Array<{ id: string; status: string }>
      >(
        `SELECT id, status FROM bank_reconciliation WHERE id = ?`,
        reconciliationId
      );

      return NextResponse.json({
        success: true,
        action: "completed",
        reconciliation: {
          id: reconciliation?.[0]?.id,
          status: reconciliation?.[0]?.status,
        },
      });
    }

    // ─── EDIT RECONCILIATION ──────────────────────────────────
    if (action === "edit") {
      if (!reconciliationId) {
        return NextResponse.json(
          { error: "reconciliationId required" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const updates: string[] = ["updated_at = ?"];
      const params: any[] = [now];

      if (body.reconciliationDate !== undefined) {
        updates.push("reconciliation_date = ?");
        params.push(body.reconciliationDate);
      }

      if (body.statementBalance !== undefined) {
        const newStatementBalance = parseFloat(String(body.statementBalance));
        updates.push("statement_balance = ?");
        params.push(newStatementBalance);

        // Recalculate difference: fetch current book_balance and recalculate
        const currentRec = await prisma.$queryRawUnsafe<
          Array<{ book_balance: number }>
        >(
          `SELECT book_balance FROM bank_reconciliation WHERE id = ?`,
          reconciliationId
        );

        if (currentRec?.[0]) {
          const newDifference = newStatementBalance - Number(currentRec[0].book_balance);
          updates.push("difference = ?");
          params.push(newDifference);
        }
      }

      params.push(reconciliationId);

      const result = await prisma.$executeRawUnsafe(
        `UPDATE bank_reconciliation SET ${updates.join(", ")} WHERE id = ?`,
        ...params
      );

      if (result === 0) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      const reconciliation = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          reconciliation_date: string;
          statement_balance: number;
          book_balance: number;
          difference: number;
        }>
      >(
        `SELECT id, reconciliation_date, statement_balance, book_balance, difference FROM bank_reconciliation WHERE id = ?`,
        reconciliationId
      );

      return NextResponse.json({
        success: true,
        action: "edited",
        reconciliation: {
          id: reconciliation?.[0]?.id,
          reconciliationDate: reconciliation?.[0]?.reconciliation_date,
          statementBalance: Number(reconciliation?.[0]?.statement_balance),
          bookBalance: Number(reconciliation?.[0]?.book_balance),
          difference: Number(reconciliation?.[0]?.difference),
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Bank reconciliation PUT error:", error);
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/companies/[companyId]/bank-reconciliation?id=xxx
 * Delete a reconciliation session
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access || access.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Reconciliation id required" },
        { status: 400 }
      );
    }

    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM bank_reconciliation WHERE id = ?`,
      id
    );

    if (result === 0) {
      return NextResponse.json(
        { error: "Reconciliation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete bank reconciliation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
