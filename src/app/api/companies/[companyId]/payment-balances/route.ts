import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({
    where: { userId, companyId },
  });
}

async function ensurePaymentBalancesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS payment_method_balances (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      opening_balance REAL DEFAULT 0,
      UNIQUE(company_id, payment_method),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);
}

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

    await ensurePaymentBalancesTable();

    const balances = await prisma.$queryRawUnsafe<
      Array<{ id: string; company_id: string; payment_method: string; opening_balance: number }>
    >(
      `SELECT id, company_id, payment_method, opening_balance FROM payment_method_balances WHERE company_id = ?`,
      params.companyId
    );

    return NextResponse.json(balances);
  } catch (error) {
    console.error("GET /payment-balances error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Viewers cannot modify balances
    if (access.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot modify payment balances" },
        { status: 403 }
      );
    }

    await ensurePaymentBalancesTable();

    const body = await request.json();
    const { balances } = body;

    if (!Array.isArray(balances)) {
      return NextResponse.json(
        { error: "balances must be an array" },
        { status: 400 }
      );
    }

    // Upsert each balance entry
    for (const balance of balances) {
      const { paymentMethod, openingBalance } = balance;

      if (!paymentMethod || openingBalance === undefined) {
        return NextResponse.json(
          { error: "Each balance entry must have paymentMethod and openingBalance" },
          { status: 400 }
        );
      }

      const id = "pmb_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

      // Use INSERT OR REPLACE (upsert) for SQLite
      await prisma.$executeRawUnsafe(
        `INSERT OR REPLACE INTO payment_method_balances (id, company_id, payment_method, opening_balance)
         VALUES (?, ?, ?, ?)`,
        id,
        params.companyId,
        paymentMethod,
        parseFloat(openingBalance)
      );
    }

    // Return updated balances
    const updatedBalances = await prisma.$queryRawUnsafe<
      Array<{ id: string; company_id: string; payment_method: string; opening_balance: number }>
    >(
      `SELECT id, company_id, payment_method, opening_balance FROM payment_method_balances WHERE company_id = ?`,
      params.companyId
    );

    return NextResponse.json(updatedBalances, { status: 201 });
  } catch (error) {
    console.error("POST /payment-balances error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
