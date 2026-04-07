import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Super admins can request all companies with ?all=true
    const url = new URL(request.url);
    const fetchAll = url.searchParams.get("all") === "true";
    const isSuperAdmin = (session.user as any).role === "super_admin";

    const companies = await prisma.company.findMany({
      where: (fetchAll && isSuperAdmin) ? {} : {
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        _count: {
          select: {
            transactions: true,
          },
        },
        users: {
          where: {
            userId: session.user.id,
          },
          select: {
            role: true,
          },
        },
      },
    });

    const companiesWithSummary = await Promise.all(
      companies.map(async (company) => {
        const [income, expense, paymentMethodByType] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              companyId: company.id,
              type: "income",
            },
            _sum: {
              amount: true,
            },
          }),
          prisma.transaction.aggregate({
            where: {
              companyId: company.id,
              type: "expense",
            },
            _sum: {
              amount: true,
            },
          }),
          prisma.transaction.groupBy({
            by: ["paymentMethod", "type"],
            where: { companyId: company.id },
            _sum: { amount: true },
            _count: true,
          }),
        ]);

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

        return {
          id: company.id,
          name: company.name,
          panVat: company.panVat,
          fiscalYearStart: company.fiscalYearStart,
          currency: company.currency,
          openingBalance: company.openingBalance || 0,
          transactionCount: company._count.transactions,
          userRole: company.users[0]?.role,
          totalIncome: income._sum.amount || 0,
          totalExpense: expense._sum.amount || 0,
          incomeByPaymentMethod,
          expenseByPaymentMethod,
        };
      })
    );

    return NextResponse.json({
      companies: companiesWithSummary.map((c) => ({
        ...c,
        netBalance: (c.openingBalance || 0) + c.totalIncome - c.totalExpense,
      })),
    });
  } catch (error) {
    console.error("Get companies error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, panVat, fiscalYearStart, currency } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    // Create company
    const company = await prisma.company.create({
      data: {
        name,
        panVat: panVat || null,
        fiscalYearStart: fiscalYearStart || null,
        currency: currency || "NPR",
        createdById: session.user.id,
      },
    });

    // Create CompanyUser link (current user as company_admin)
    await prisma.companyUser.create({
      data: {
        companyId: company.id,
        userId: session.user.id,
        role: "company_admin",
      },
    });

    // Create default income categories
    const incomeCategories = ["Delivery Fee", "COD Commission", "Monthly Subscription"];
    for (const categoryName of incomeCategories) {
      await prisma.category.create({
        data: {
          name: categoryName,
          type: "income",
          companyId: company.id,
        },
      });
    }

    // Create default expense categories
    const expenseCategories = ["Fuel", "Salary", "Rent", "Vehicle Maintenance", "Office Supplies"];
    for (const categoryName of expenseCategories) {
      await prisma.category.create({
        data: {
          name: categoryName,
          type: "expense",
          companyId: company.id,
        },
      });
    }

    return NextResponse.json(
      {
        id: company.id,
        name: company.name,
        panVat: company.panVat,
        fiscalYearStart: company.fiscalYearStart,
        currency: company.currency,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create company error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
