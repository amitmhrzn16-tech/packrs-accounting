import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
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

    const url = new URL(request.url);
    const bankAccountId = url.searchParams.get("bankAccountId");

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
       FROM bank_reconciliations
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

    let unreconciled = [];

    // If bankAccountId is provided, fetch unreconciled transactions
    if (bankAccountId) {
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
        `SELECT id, date, type, amount, particulars, payment_method, is_reconciled
         FROM transactions
         WHERE company_id = ? AND payment_method = 'bank' AND (bank_account_id = ? OR bank_account_id IS NULL)
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

    const openingBalance = accountResult?.[0]?.opening_balance || 0;
    const totalTransactions = bookBalanceResult?.[0]?.total || 0;
    const bookBalance = openingBalance + totalTransactions;
    const difference = statementBalance - bookBalance;

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        companyId: params.companyId,
        bankAccountId,
        reconciliationDate,
        statementBalance,
        bookBalance,
        difference,
        status: "draft",
      },
    });

    return NextResponse.json({
      id: reconciliation.id,
      bankAccountId: reconciliation.bankAccountId,
      reconciliationDate: reconciliation.reconciliationDate,
      statementBalance: reconciliation.statementBalance,
      bookBalance: reconciliation.bookBalance,
      difference: reconciliation.difference,
      status: reconciliation.status,
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

      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          isReconciled: true,
          bankAccountId,
        },
      });

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

      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          isReconciled: false,
          bankAccountId: null,
        },
      });

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

      const reconciliation = await prisma.bankReconciliation.update({
        where: { id: reconciliationId },
        data: { status: "completed" },
      });

      return NextResponse.json({
        success: true,
        action: "completed",
        reconciliation: {
          id: reconciliation.id,
          status: reconciliation.status,
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

      const updateData: Record<string, any> = {};
      if (body.reconciliationDate !== undefined)
        updateData.reconciliationDate = body.reconciliationDate;
      if (body.statementBalance !== undefined)
        updateData.statementBalance = parseFloat(String(body.statementBalance));

      const reconciliation = await prisma.bankReconciliation.update({
        where: { id: reconciliationId },
        data: updateData,
      });

      return NextResponse.json({
        success: true,
        action: "edited",
        reconciliation: {
          id: reconciliation.id,
          reconciliationDate: reconciliation.reconciliationDate,
          statementBalance: reconciliation.statementBalance,
          bookBalance: reconciliation.bookBalance,
          difference: reconciliation.difference,
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

    await prisma.bankReconciliation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete bank reconciliation error:", error);
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Reconciliation not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
