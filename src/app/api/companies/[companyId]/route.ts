import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: {
    companyId: string;
  };
}

async function verifyCompanyAccess(companyId: string, userId: string) {
  const companyUser = await prisma.companyUser.findFirst({
    where: {
      companyId,
      userId,
    },
  });

  return !!companyUser;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { companyId } = params;

    // Verify access
    const hasAccess = await verifyCompanyAccess(companyId, session.user.id);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        users: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Aggregate income and expense totals
    const [income, expense] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          companyId,
          type: "income",
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.transaction.aggregate({
        where: {
          companyId,
          type: "expense",
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const totalIncome = income._sum.amount || 0;
    const totalExpense = expense._sum.amount || 0;

    const companyWithTotals = {
      id: company.id,
      name: company.name,
      panVat: company.panVat,
      fiscalYearStart: company.fiscalYearStart,
      currency: company.currency,
      openingBalance: company.openingBalance || 0,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      totalIncome,
      totalExpense,
      netBalance: (company.openingBalance || 0) + totalIncome - totalExpense,
      users: company.users,
    };

    return NextResponse.json(companyWithTotals);
  } catch (error) {
    console.error("Get company error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { companyId } = params;

    // Verify access
    const hasAccess = await verifyCompanyAccess(companyId, session.user.id);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, panVat, fiscalYearStart, currency, openingBalance } = body;

    // Build update data (only include provided fields)
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (panVat !== undefined) updateData.panVat = panVat;
    if (fiscalYearStart !== undefined) updateData.fiscalYearStart = fiscalYearStart;
    if (currency !== undefined) updateData.currency = currency;
    if (openingBalance !== undefined) updateData.openingBalance = parseFloat(openingBalance) || 0;

    const company = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });

    return NextResponse.json({
      id: company.id,
      name: company.name,
      panVat: company.panVat,
      fiscalYearStart: company.fiscalYearStart,
      currency: company.currency,
      openingBalance: company.openingBalance || 0,
      updatedAt: company.updatedAt,
    });
  } catch (error) {
    console.error("Update company error:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
