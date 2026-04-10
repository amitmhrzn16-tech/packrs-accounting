import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";

function cuid() {
  return "ap" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list advance payments
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

    const url = new URL(request.url);
    const staffId = url.searchParams.get("staffId");
    const status = url.searchParams.get("status");

    let where = `ap.company_id = '${params.companyId}'`;
    if (staffId) where += ` AND ap.staff_id = '${staffId}'`;
    if (status) where += ` AND ap.status = '${status}'`;

    const advances: any[] = await prisma.$queryRawUnsafe(
      `SELECT ap.*, s.name as staff_name, s.role as staff_role,
              u.name as created_by_name
       FROM advance_payments ap
       LEFT JOIN staff s ON s.id = ap.staff_id
       LEFT JOIN users u ON u.id = ap.created_by
       WHERE ${where}
       ORDER BY ap.payment_date DESC`
    );

    // Get recoveries for each advance
    const advancesWithRecoveries = await Promise.all(
      advances.map(async (a: any) => {
        const recoveries: any[] = await prisma.$queryRawUnsafe(
          `SELECT ar.*, u.name as recovered_by_name
           FROM advance_recoveries ar
           LEFT JOIN users u ON u.id = ar.created_by
           WHERE ar.advance_id = ?
           ORDER BY ar.recovery_date DESC`,
          a.id
        );
        return {
          ...a,
          staffName: a.staff_name,
          staffRole: a.staff_role,
          paymentDate: a.payment_date,
          paymentMethod: a.payment_method,
          referenceNo: a.reference_no,
          dueAmount: a.due_amount,
          recoveryDeadline: a.recovery_deadline,
          createdByName: a.created_by_name,
          createdAt: a.created_at,
          recoveries: recoveries.map((r: any) => ({
            ...r,
            recoveryDate: r.recovery_date,
            recoveryMethod: r.recovery_method,
            recoveredByName: r.recovered_by_name,
          })),
        };
      })
    );

    // Summary
    const summary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_advances,
              COALESCE(SUM(amount), 0) as total_given,
              COALESCE(SUM(due_amount), 0) as total_outstanding,
              COALESCE(SUM(amount - due_amount), 0) as total_recovered
       FROM advance_payments WHERE company_id = '${params.companyId}'`
    );

    return NextResponse.json({
      advances: advancesWithRecoveries,
      summary: summary[0] || { total_advances: 0, total_given: 0, total_outstanding: 0, total_recovered: 0 },
    });
  } catch (error) {
    console.error("GET /advance-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create advance payment (auto-sets due)
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

    const body = await request.json();
    const { staffId, amount, paymentDate, paymentMethod, referenceNo, reason, recoveryDeadline, notes } = body;

    if (!staffId || !amount || !paymentDate) {
      return NextResponse.json({ error: "staffId, amount, paymentDate are required" }, { status: 400 });
    }

    const id = cuid();
    const now = new Date().toISOString();

    // Auto-set due_amount = amount (full amount is due)
    await prisma.$executeRawUnsafe(
      `INSERT INTO advance_payments (id, company_id, staff_id, amount, payment_date, payment_method, reference_no, reason, due_amount, status, recovery_deadline, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'due', ?, ?, ?, ?, ?)`,
      id, params.companyId, staffId, amount, paymentDate,
      paymentMethod || "cash", referenceNo || null, reason || null,
      amount, // due_amount starts as full amount
      recoveryDeadline || null, notes || null,
      session.user.id, now, now
    );

    // Create expense transaction for accounting
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, company_id, type, amount, particulars, date, payment_method, reference_no, created_by, source, created_at, updated_at)
       VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, 'web', ?, ?)`,
      txnId, params.companyId, amount,
      `Advance to staff${reason ? `: ${reason}` : ""}`,
      paymentDate, paymentMethod || "cash", referenceNo || null,
      session.user.id, now, now
    );

    // Get staff & company info for Slack
    const staffInfo: any[] = await prisma.$queryRawUnsafe(`SELECT name FROM staff WHERE id = ?`, staffId);
    const company: any[] = await prisma.$queryRawUnsafe(`SELECT currency FROM companies WHERE id = ?`, params.companyId);
    const currency = company[0]?.currency || "NPR";

    notifySlack(
      params.companyId,
      `⚠️ *Advance Given* to *${staffInfo[0]?.name || "Staff"}*\n` +
      `> Amount: ${formatCurrency(amount, currency)} | Method: ${paymentMethod || "cash"}\n` +
      `> Status: *DUE* (auto-set as receivable)${recoveryDeadline ? ` | Deadline: ${recoveryDeadline}` : ""}\n` +
      `> ${reason || "No reason specified"}`
    ).catch(() => {});

    return NextResponse.json({ id, dueAmount: amount, transactionId: txnId }, { status: 201 });
  } catch (error) {
    console.error("POST /advance-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
