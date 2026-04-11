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
 * GET /api/companies/[companyId]/bank-accounts
 * Returns list of bank accounts for the company
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

    const accounts = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        account_name: string;
        account_number: string;
        bank_name: string;
        branch: string | null;
        account_type: string;
        opening_balance: number;
        is_active: number;
      }>
    >(
      `SELECT id, account_name, account_number, bank_name, branch, account_type, opening_balance, is_active
       FROM bank_accounts
       WHERE company_id = ?
       ORDER BY created_at DESC`,
      params.companyId
    );

    const formattedAccounts = accounts.map((acc) => ({
      id: acc.id,
      accountName: acc.account_name,
      accountNumber: acc.account_number,
      bankName: acc.bank_name,
      branch: acc.branch,
      accountType: acc.account_type,
      openingBalance: acc.opening_balance,
      isActive: acc.is_active === 1,
    }));

    return NextResponse.json(formattedAccounts);
  } catch (error) {
    console.error("Get bank accounts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[companyId]/bank-accounts
 * Create a new bank account
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
    const {
      accountName,
      accountNumber,
      bankName,
      branch,
      accountType,
      openingBalance,
    } = body;

    // Validate required fields
    if (
      !accountName ||
      !accountNumber ||
      !bankName ||
      !accountType
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.create({
      data: {
        companyId: params.companyId,
        accountName,
        accountNumber,
        bankName,
        branch: branch || null,
        accountType,
        openingBalance: parseFloat(String(openingBalance)) || 0,
      },
    });

    return NextResponse.json({
      id: account.id,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branch: account.branch,
      accountType: account.accountType,
      openingBalance: account.openingBalance,
      isActive: account.isActive,
    });
  } catch (error: any) {
    console.error("Create bank account error:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Account number already exists for this company" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/companies/[companyId]/bank-accounts
 * Update a bank account by id
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
    const { id, accountName, accountNumber, bankName, branch, accountType, openingBalance } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Account id required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (accountName !== undefined) updateData.accountName = accountName;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (branch !== undefined) updateData.branch = branch;
    if (accountType !== undefined) updateData.accountType = accountType;
    if (openingBalance !== undefined)
      updateData.openingBalance = parseFloat(String(openingBalance)) || 0;

    const account = await prisma.bankAccount.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: account.id,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branch: account.branch,
      accountType: account.accountType,
      openingBalance: account.openingBalance,
      isActive: account.isActive,
    });
  } catch (error: any) {
    console.error("Update bank account error:", error);
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Bank account not found" },
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
 * DELETE /api/companies/[companyId]/bank-accounts?id=xxx
 * Deactivate a bank account (set is_active = false)
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
        { error: "Account id required" },
        { status: 400 }
      );
    }

    await prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete bank account error:", error);
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
