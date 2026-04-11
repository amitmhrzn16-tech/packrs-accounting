import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * GET /api/companies/[companyId]/reconciliation
 * Returns the reconciliation status: matched, unmatched bank, unmatched book entries
 */
export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = params.companyId;
    const url = new URL(request.url);
    const paymentMethodFilter = url.searchParams.get("paymentMethod") || "";

    // Get all bank transactions with match info
    const bankTransactions = await prisma.bankTransaction.findMany({
      where: { companyId },
      orderBy: { date: "desc" },
    });

    // Get matched book entries
    const matchedBankTxnIds = bankTransactions
      .filter((bt) => bt.isMatched && bt.matchedTxnId)
      .map((bt) => bt.matchedTxnId as string);

    const matchedBookEntries = matchedBankTxnIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: matchedBankTxnIds } },
          include: { category: true },
        })
      : [];

    // Get unreconciled book entries (not matched to any bank transaction)
    const reconciledTxnIds = matchedBankTxnIds;
    const bookWhere: any = {
      companyId,
      isReconciled: false,
      id: { notIn: reconciledTxnIds },
    };
    if (paymentMethodFilter) {
      bookWhere.paymentMethod = paymentMethodFilter;
    }
    const unmatchedBookEntries = await prisma.transaction.findMany({
      where: bookWhere,
      include: { category: true },
      orderBy: { date: "desc" },
    });

    // Separate bank transactions
    const matchedBank = bankTransactions.filter((bt) => bt.isMatched);
    const unmatchedBank = bankTransactions.filter((bt) => !bt.isMatched);

    // Import batches summary
    const importBatches = await prisma.importBatch.findMany({
      where: { companyId },
      orderBy: { importedAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      matched: matchedBank.map((bt) => ({
        bankTransaction: bt,
        bookEntry: matchedBookEntries.find((be) => be.id === bt.matchedTxnId),
      })),
      unmatchedBank,
      unmatchedBook: unmatchedBookEntries,
      summary: {
        totalBankTransactions: bankTransactions.length,
        matchedCount: matchedBank.length,
        unmatchedBankCount: unmatchedBank.length,
        unmatchedBookCount: unmatchedBookEntries.length,
      },
      importBatches,
    });
  } catch (error) {
    console.error("Reconciliation GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/companies/[companyId]/reconciliation
 * Actions: confirm match, reject match, create entry from bank txn
 */
export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
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
    const { action, bankTxnId, bookTxnId, newEntry } = body;

    // ─── CONFIRM A MATCH ────────────────────────────────────────
    if (action === "confirm") {
      if (!bankTxnId || !bookTxnId) {
        return NextResponse.json({ error: "bankTxnId and bookTxnId required" }, { status: 400 });
      }

      await prisma.bankTransaction.update({
        where: { id: bankTxnId },
        data: {
          isMatched: true,
          matchedTxnId: bookTxnId,
          matchConfidence: 1.0,
        },
      });

      await prisma.transaction.update({
        where: { id: bookTxnId },
        data: {
          isReconciled: true,
          bankTxnId: bankTxnId,
        },
      });

      return NextResponse.json({ success: true, action: "confirmed" });
    }

    // ─── REJECT A MATCH ─────────────────────────────────────────
    if (action === "reject") {
      if (!bankTxnId) {
        return NextResponse.json({ error: "bankTxnId required" }, { status: 400 });
      }

      const bankTxn = await prisma.bankTransaction.findUnique({
        where: { id: bankTxnId },
      });

      if (bankTxn?.matchedTxnId) {
        await prisma.transaction.update({
          where: { id: bankTxn.matchedTxnId },
          data: { isReconciled: false, bankTxnId: null },
        });
      }

      await prisma.bankTransaction.update({
        where: { id: bankTxnId },
        data: {
          isMatched: false,
          matchedTxnId: null,
          matchConfidence: null,
        },
      });

      return NextResponse.json({ success: true, action: "rejected" });
    }

    // ─── CREATE ENTRY FROM BANK TXN ─────────────────────────────
    if (action === "create") {
      if (!bankTxnId || !newEntry) {
        return NextResponse.json({ error: "bankTxnId and newEntry required" }, { status: 400 });
      }

      const bankTxn = await prisma.bankTransaction.findUnique({
        where: { id: bankTxnId },
      });

      if (!bankTxn) {
        return NextResponse.json({ error: "Bank transaction not found" }, { status: 404 });
      }

      // Determine type from bank transaction
      const type = (bankTxn.credit ?? 0) > 0 ? "income" : "expense";
      const amount = (bankTxn.credit ?? 0) > 0 ? bankTxn.credit! : bankTxn.debit!;

      const transaction = await prisma.transaction.create({
        data: {
          companyId: params.companyId,
          type,
          amount,
          categoryId: newEntry.categoryId || null,
          particulars: newEntry.particulars || bankTxn.description || "",
          date: bankTxn.date,
          paymentMethod: newEntry.paymentMethod || "bank",
          createdById: session.user.id,
          source: "import",
          isReconciled: true,
          bankTxnId: bankTxnId,
        },
      });

      // Mark bank transaction as matched
      await prisma.bankTransaction.update({
        where: { id: bankTxnId },
        data: {
          isMatched: true,
          matchedTxnId: transaction.id,
          matchConfidence: 1.0,
        },
      });

      return NextResponse.json({ success: true, action: "created", transaction });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Reconciliation POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
