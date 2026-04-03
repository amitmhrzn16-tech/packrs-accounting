import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * GET /api/companies/[companyId]/cash-reconciliation
 * Returns cash transactions summary, system cash balance, and recent cash transactions
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

    // Read optional date filters
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    // Build where clause for cash transactions
    const dateFilter: Record<string, string> = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    const cashWhere: any = {
      companyId,
      paymentMethod: "cash",
    };
    if (dateFrom || dateTo) {
      cashWhere.date = dateFilter;
    }

    // Get company opening balance
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { openingBalance: true },
    });

    // Aggregate cash income and cash expense
    const [cashIncome, cashExpense] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...cashWhere, type: "income" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...cashWhere, type: "expense" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const totalCashIncome = cashIncome._sum.amount || 0;
    const totalCashExpense = cashExpense._sum.amount || 0;
    const systemCashBalance = totalCashIncome - totalCashExpense;

    // Get recent cash transactions
    const cashTransactions = await prisma.transaction.findMany({
      where: cashWhere,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    });

    // Monthly cash breakdown
    const allCashTxns = await prisma.transaction.findMany({
      where: cashWhere,
      select: { date: true, type: true, amount: true },
    });

    const monthlyMap = new Map<string, { income: number; expense: number }>();
    allCashTxns.forEach((txn) => {
      const month = txn.date.substring(0, 7); // YYYY-MM
      const existing = monthlyMap.get(month) || { income: 0, expense: 0 };
      if (txn.type === "income") {
        existing.income += txn.amount;
      } else {
        existing.expense += txn.amount;
      }
      monthlyMap.set(month, existing);
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: data.income,
        expense: data.expense,
        net: data.income - data.expense,
      }));

    return NextResponse.json({
      systemCashBalance,
      totalCashIncome,
      totalCashExpense,
      cashIncomeCount: cashIncome._count || 0,
      cashExpenseCount: cashExpense._count || 0,
      totalCashTransactions: (cashIncome._count || 0) + (cashExpense._count || 0),
      cashTransactions,
      monthlyData,
      dateRange: {
        from: dateFrom || null,
        to: dateTo || null,
      },
    });
  } catch (error) {
    console.error("Cash reconciliation GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[companyId]/cash-reconciliation
 * Actions: submit cash count, adjust discrepancy
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
    const { action } = body;

    // ─── SUBMIT CASH COUNT ──────────────────────────────────────
    if (action === "cash_count") {
      const { physicalCash, notes, date } = body;

      if (physicalCash === undefined || physicalCash === null) {
        return NextResponse.json(
          { error: "physicalCash amount is required" },
          { status: 400 }
        );
      }

      const countDate = date || new Date().toISOString().split("T")[0];

      // Calculate system cash balance up to the count date
      const [cashIncome, cashExpense] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            companyId: params.companyId,
            paymentMethod: "cash",
            type: "income",
            date: { lte: countDate },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            companyId: params.companyId,
            paymentMethod: "cash",
            type: "expense",
            date: { lte: countDate },
          },
          _sum: { amount: true },
        }),
      ]);

      const systemBalance =
        (cashIncome._sum.amount || 0) - (cashExpense._sum.amount || 0);
      const discrepancy = parseFloat(physicalCash) - systemBalance;

      // Log the cash count as an audit entry
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          companyId: params.companyId,
          action: "cash_count",
          entityType: "cash_reconciliation",
          entityId: `cash-count-${countDate}`,
          newValues: JSON.stringify({
            date: countDate,
            physicalCash: parseFloat(physicalCash),
            systemBalance,
            discrepancy,
            notes: notes || "",
          }),
        },
      });

      return NextResponse.json({
        success: true,
        date: countDate,
        physicalCash: parseFloat(physicalCash),
        systemBalance,
        discrepancy,
      });
    }

    // ─── ADJUST DISCREPANCY ─────────────────────────────────────
    if (action === "adjust") {
      const { amount, type, particulars, date } = body;

      if (!amount || !type) {
        return NextResponse.json(
          { error: "amount and type are required" },
          { status: 400 }
        );
      }

      const adjustDate = date || new Date().toISOString().split("T")[0];

      // Create an adjustment transaction
      const transaction = await prisma.transaction.create({
        data: {
          companyId: params.companyId,
          type, // income or expense
          amount: Math.abs(parseFloat(amount)),
          particulars:
            particulars || `Cash adjustment - ${type === "income" ? "Surplus" : "Shortage"}`,
          date: adjustDate,
          paymentMethod: "cash",
          createdById: session.user.id,
          source: "web",
        },
      });

      // Log the adjustment
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          companyId: params.companyId,
          action: "create",
          entityType: "cash_adjustment",
          entityId: transaction.id,
          newValues: JSON.stringify({
            type,
            amount: Math.abs(parseFloat(amount)),
            particulars: transaction.particulars,
            date: adjustDate,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        action: "adjusted",
        transaction,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Cash reconciliation POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
