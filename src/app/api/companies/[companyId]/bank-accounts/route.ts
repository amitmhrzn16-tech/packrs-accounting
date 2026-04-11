import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

function cuid() {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}

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

    // Self-healing migration: ensure payment_method column exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE bank_accounts ADD COLUMN payment_method TEXT DEFAULT 'bank'`);
    } catch (_) {
      // Column already exists
    }

    const accounts = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        account_name: string;
        account_number: string;
        bank_name: string;
        branch: string | null;
        account_type: string;
        payment_method: string | null;
        opening_balance: number;
        is_active: number;
      }>
    >(
      `SELECT id, account_name, account_number, bank_name, branch, account_type, COALESCE(payment_method, 'bank') as payment_method, opening_balance, is_active
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
      paymentMethod: acc.payment_method || "bank",
      openingBalance: Number(acc.opening_balance),
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
      paymentMethod,
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

    const id = cuid();
    const openingBalanceNum = parseFloat(String(openingBalance)) || 0;
    const branchVal = branch || null;

    // Escape string values
    const escapedAccountName = accountName.replace(/'/g, "''");
    const escapedAccountNumber = accountNumber.replace(/'/g, "''");
    const escapedBankName = bankName.replace(/'/g, "''");
    const escapedBranch = branchVal ? branchVal.replace(/'/g, "''") : null;
    const escapedAccountType = accountType.replace(/'/g, "''");

    // Check if account number already exists for this company
    const existing = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM bank_accounts
       WHERE company_id = ? AND account_number = ?`,
      params.companyId,
      accountNumber
    );

    if (existing[0].count > 0) {
      return NextResponse.json(
        { error: "Account number already exists for this company" },
        { status: 409 }
      );
    }

    const pmVal = paymentMethod || "bank";

    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_accounts (
        id, company_id, account_name, account_number, bank_name, branch,
        account_type, payment_method, opening_balance, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      id,
      params.companyId,
      escapedAccountName,
      escapedAccountNumber,
      escapedBankName,
      escapedBranch,
      escapedAccountType,
      pmVal,
      openingBalanceNum
    );

    return NextResponse.json({
      id,
      accountName,
      accountNumber,
      bankName,
      branch: branchVal,
      accountType,
      paymentMethod: pmVal,
      openingBalance: openingBalanceNum,
      isActive: true,
    });
  } catch (error: any) {
    console.error("Create bank account error:", error);
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
    const { id, accountName, accountNumber, bankName, branch, accountType, paymentMethod, openingBalance } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Account id required" },
        { status: 400 }
      );
    }

    // Verify account exists and belongs to this company
    const existing = await prisma.$queryRawUnsafe<
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
       WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      );
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];

    if (accountName !== undefined) {
      updates.push("account_name = ?");
      values.push(accountName.replace(/'/g, "''"));
    }
    if (accountNumber !== undefined) {
      updates.push("account_number = ?");
      values.push(accountNumber.replace(/'/g, "''"));
    }
    if (bankName !== undefined) {
      updates.push("bank_name = ?");
      values.push(bankName.replace(/'/g, "''"));
    }
    if (branch !== undefined) {
      updates.push("branch = ?");
      values.push(branch ? branch.replace(/'/g, "''") : null);
    }
    if (accountType !== undefined) {
      updates.push("account_type = ?");
      values.push(accountType.replace(/'/g, "''"));
    }
    if (openingBalance !== undefined) {
      updates.push("opening_balance = ?");
      values.push(parseFloat(String(openingBalance)) || 0);
    }
    if (paymentMethod !== undefined) {
      updates.push("payment_method = ?");
      values.push(paymentMethod);
    }

    if (updates.length === 0) {
      // No fields to update, return current record
      const acc = existing[0];
      return NextResponse.json({
        id: acc.id,
        accountName: acc.account_name,
        accountNumber: acc.account_number,
        bankName: acc.bank_name,
        branch: acc.branch,
        accountType: acc.account_type,
        openingBalance: Number(acc.opening_balance),
        isActive: acc.is_active === 1,
      });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id, params.companyId);

    const updateQuery = `UPDATE bank_accounts SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`;
    await prisma.$executeRawUnsafe(updateQuery, ...values);

    // Fetch updated record
    const updated = await prisma.$queryRawUnsafe<
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
       WHERE id = ?`,
      id
    );

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      );
    }

    const acc = updated[0];
    return NextResponse.json({
      id: acc.id,
      accountName: acc.account_name,
      accountNumber: acc.account_number,
      bankName: acc.bank_name,
      branch: acc.branch,
      accountType: acc.account_type,
      openingBalance: Number(acc.opening_balance),
      isActive: acc.is_active === 1,
    });
  } catch (error: any) {
    console.error("Update bank account error:", error);
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

    // Verify account exists and belongs to this company
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM bank_accounts WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE bank_accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
      id
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete bank account error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
