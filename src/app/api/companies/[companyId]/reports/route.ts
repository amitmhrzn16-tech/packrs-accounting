import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = params.companyId;

    const companyUser = await prisma.companyUser.findFirst({
      where: { userId: session.user.id, companyId },
    });

    if (!companyUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Read optional date filters from query params ──
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("dateFrom"); // YYYY-MM-DD
    const dateTo = url.searchParams.get("dateTo"); // YYYY-MM-DD

    // Build date filter for transactions
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;
    const hasDateFilter = dateFrom || dateTo;

    const txnWhere: any = { companyId };
    if (hasDateFilter) txnWhere.date = dateFilter;

    // ── Totals (filtered by date range if provided) ──
    const [incomeResult, expenseResult] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...txnWhere, type: "income" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...txnWhere, type: "expense" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Fetch opening balance from company
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { openingBalance: true },
    });
    const openingBalance = company?.openingBalance || 0;

    const totalIncome = incomeResult._sum.amount || 0;
    const totalExpense = expenseResult._sum.amount || 0;
    const netBalance = openingBalance + totalIncome - totalExpense;
    const totalIncomeCount = incomeResult._count || 0;
    const totalExpenseCount = expenseResult._count || 0;
    const totalTransactions = totalIncomeCount + totalExpenseCount;

    // ── Monthly breakdown (within the date range or last 6 months) ──
    const now = new Date();
    let monthlyStartStr: string;
    if (dateFrom) {
      monthlyStartStr = dateFrom;
    } else {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      monthlyStartStr = sixMonthsAgo.toISOString().slice(0, 10);
    }

    const monthlyWhere: any = { companyId, date: { gte: monthlyStartStr } };
    if (dateTo) monthlyWhere.date.lte = dateTo;

    const monthlyTransactions = await prisma.transaction.findMany({
      where: monthlyWhere,
      select: { date: true, type: true, amount: true },
      orderBy: { date: "asc" },
    });

    // Build monthly data
    const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();

    // Generate month slots
    const startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const endDate = dateTo ? new Date(dateTo) : now;

    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cursor <= endDate) {
      const monthKey = cursor.toISOString().slice(0, 7);
      const monthLabel = cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      monthlyMap.set(monthKey, { month: monthLabel, income: 0, expense: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    monthlyTransactions.forEach((txn) => {
      const monthKey = txn.date.slice(0, 7);
      const entry = monthlyMap.get(monthKey);
      if (entry) {
        if (txn.type === "income") entry.income += txn.amount;
        else entry.expense += txn.amount;
      }
    });

    const monthlyData = Array.from(monthlyMap.values());

    // ── Top 5 expense categories (within date range) ──
    const topExpenseCategoriesRaw = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...txnWhere, type: "expense" },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    });

    const topExpenseCategories = await Promise.all(
      topExpenseCategoriesRaw.map(async (item) => {
        const category = await prisma.category.findUnique({
          where: { id: item.categoryId || "" },
          select: { id: true, name: true },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Uncategorized",
          amount: item._sum.amount || 0,
        };
      })
    );

    // ── Top 5 income categories (within date range) ──
    const topIncomeCategoriesRaw = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...txnWhere, type: "income" },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    });

    const topIncomeCategories = await Promise.all(
      topIncomeCategoriesRaw.map(async (item) => {
        const category = await prisma.category.findUnique({
          where: { id: item.categoryId || "" },
          select: { id: true, name: true },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Uncategorized",
          amount: item._sum.amount || 0,
        };
      })
    );

    // ── Payment method breakdown (within date range) ──
    const paymentMethodBreakdown = await prisma.transaction.groupBy({
      by: ["paymentMethod"],
      where: txnWhere,
      _sum: { amount: true },
      _count: true,
    });

    const paymentMethods = paymentMethodBreakdown.map((item) => ({
      method: item.paymentMethod || "Unknown",
      total: item._sum.amount || 0,
      count: item._count || 0,
    }));

    // ── Payment method breakdown by type (income/expense) ──
    const paymentMethodByType = await prisma.transaction.groupBy({
      by: ["paymentMethod", "type"],
      where: txnWhere,
      _sum: { amount: true },
      _count: true,
    });

    const incomeByPaymentMethod = paymentMethodByType
      .filter((item) => item.type === "income")
      .map((item) => ({
        method: item.paymentMethod || "Unknown",
        amount: item._sum.amount || 0,
        count: item._count || 0,
      }));

    const expenseByPaymentMethod = paymentMethodByType
      .filter((item) => item.type === "expense")
      .map((item) => ({
        method: item.paymentMethod || "Unknown",
        amount: item._sum.amount || 0,
        count: item._count || 0,
      }));

    // ── Recent transactions (within date range, last 10) ──
    const recentTransactions = await prisma.transaction.findMany({
      where: txnWhere,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
      take: 10,
    });

    return NextResponse.json({
      openingBalance,
      totalIncome,
      totalExpense,
      netBalance,
      totalIncomeCount,
      totalExpenseCount,
      totalTransactions,
      monthlyData,
      topExpenseCategories,
      topIncomeCategories,
      paymentMethods,
      incomeByPaymentMethod,
      expenseByPaymentMethod,
      recentTransactions,
      dateRange: {
        from: dateFrom || null,
        to: dateTo || null,
      },
    });
  } catch (error) {
    console.error("GET /reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
