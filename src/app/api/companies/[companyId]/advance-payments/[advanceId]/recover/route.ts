import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// POST — record a manual advance recovery (cash return, bank return, etc.)
export async function POST(
  request: Request,
  { params }: { params: { companyId: string; advanceId: string } }
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

    const body = await request.json();
    const { amount, recoveryDate, recoveryMethod, notes } = body;

    if (!amount || !recoveryDate) {
      return NextResponse.json({ error: "amount and recoveryDate are required" }, { status: 400 });
    }

    // Get current advance
    const advance: any[] = await prisma.$queryRawUnsafe(
      `SELECT ap.*, s.name as staff_name FROM advance_payments ap
       LEFT JOIN staff s ON s.id = ap.staff_id
       WHERE ap.id = ? AND ap.company_id = ?`,
      params.advanceId, params.companyId
    );

    if (!advance.length) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }

    const adv = advance[0];
    const currentDue = Number(adv.due_amount);
    if (amount > currentDue) {
      return NextResponse.json({ error: `Recovery amount (${amount}) exceeds due amount (${currentDue})` }, { status: 400 });
    }

    const newDue = currentDue - amount;
    const newStatus = newDue <= 0 ? "recovered" : "partially_recovered";
    const now = new Date().toISOString();

    // Create recovery record
    const recId = "ar" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await prisma.$executeRawUnsafe(
      `INSERT INTO advance_recoveries (id, advance_id, amount, recovery_date, recovery_method, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      recId, params.advanceId, amount, recoveryDate,
      recoveryMethod || "cash_return", notes || null,
      session.user.id, now
    );

    // Update advance
    await prisma.$executeRawUnsafe(
      `UPDATE advance_payments SET due_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
      newDue, newStatus, now, params.advanceId
    );

    // Create income transaction (money coming back)
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, company_id, type, amount, particulars, date, payment_method, created_by, source, created_at, updated_at)
       VALUES (?, ?, 'income', ?, ?, ?, ?, ?, 'web', ?, ?)`,
      txnId, params.companyId, amount,
      `Advance recovery from ${adv.staff_name || "staff"}`,
      recoveryDate, recoveryMethod === "cash_return" ? "cash" : "bank",
      session.user.id, now, now
    );

    // Slack
    const company: any[] = await prisma.$queryRawUnsafe(`SELECT currency FROM companies WHERE id = ?`, params.companyId);
    const currency = company[0]?.currency || "NPR";

    notifySlack(
      params.companyId,
      `✅ *Advance Recovery* from *${adv.staff_name || "Staff"}*\n` +
      `> Recovered: ${formatCurrency(amount, currency)} | Remaining due: ${formatCurrency(newDue, currency)}\n` +
      `> Status: *${newStatus.replace("_", " ").toUpperCase()}*`
    ).catch(() => {});

    return NextResponse.json({ newDue, newStatus, recoveryId: recId, transactionId: txnId });
  } catch (error) {
    console.error("POST /advance-payments/recover error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
