import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";

function cuid() {
  return "sp" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list salary payments with optional filters
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
    const month = url.searchParams.get("month");
    const status = url.searchParams.get("status");

    let where = `sp.company_id = '${params.companyId}'`;
    if (staffId) where += ` AND sp.staff_id = '${staffId}'`;
    if (month) where += ` AND sp.month = '${month}'`;
    if (status) where += ` AND sp.status = '${status}'`;

    const payments: any[] = await prisma.$queryRawUnsafe(
      `SELECT sp.*, s.name as staff_name, s.role as staff_role, s.salary_amount as agreed_salary,
              u.name as created_by_name
       FROM salary_payments sp
       LEFT JOIN staff s ON s.id = sp.staff_id
       LEFT JOIN users u ON u.id = sp.created_by
       WHERE ${where}
       ORDER BY sp.payment_date DESC, s.name ASC`
    );

    // Get summary
    const summary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_count,
              COALESCE(SUM(net_amount), 0) as total_paid,
              COALESCE(SUM(deductions), 0) as total_deductions,
              COALESCE(SUM(bonus), 0) as total_bonus
       FROM salary_payments WHERE company_id = '${params.companyId}'
       ${month ? `AND month = '${month}'` : ""}`
    );

    return NextResponse.json({
      payments: payments.map((p: any) => ({
        ...p,
        staffName: p.staff_name,
        staffRole: p.staff_role,
        agreedSalary: p.agreed_salary,
        paymentDate: p.payment_date,
        paymentMethod: p.payment_method,
        referenceNo: p.reference_no,
        netAmount: p.net_amount,
        createdByName: p.created_by_name,
        createdBy: p.created_by,
        createdAt: p.created_at,
      })),
      summary: summary[0] || { total_count: 0, total_paid: 0, total_deductions: 0, total_bonus: 0 },
    });
  } catch (error) {
    console.error("GET /salary-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create salary payment
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
    const { staffId, amount, month, paymentDate, paymentMethod, referenceNo, deductions, bonus, notes, autoDeductAdvance } = body;

    if (!staffId || !amount || !month || !paymentDate) {
      return NextResponse.json({ error: "staffId, amount, month, paymentDate are required" }, { status: 400 });
    }

    const dedAmt = deductions || 0;
    const bonusAmt = bonus || 0;
    let netAmount = amount - dedAmt + bonusAmt;

    // Auto-deduct pending advances if requested
    let advanceDeduction = 0;
    if (autoDeductAdvance) {
      const pendingAdvances: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, due_amount FROM advance_payments WHERE staff_id = ? AND status != 'recovered' AND due_amount > 0 ORDER BY payment_date ASC`,
        staffId
      );

      let remaining = netAmount * 0.25; // max 25% of salary for advance recovery
      for (const adv of pendingAdvances) {
        if (remaining <= 0) break;
        const recoveryAmount = Math.min(adv.due_amount, remaining);
        const newDue = adv.due_amount - recoveryAmount;
        const newStatus = newDue <= 0 ? "recovered" : "partially_recovered";

        // Create recovery record
        const recId = "ar" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        await prisma.$executeRawUnsafe(
          `INSERT INTO advance_recoveries (id, advance_id, amount, recovery_date, recovery_method, salary_payment_id, notes, created_by, created_at)
           VALUES (?, ?, ?, ?, 'salary_deduction', NULL, ?, ?, ?)`,
          recId, adv.id, recoveryAmount, paymentDate, `Auto-deducted from ${month} salary`, session.user.id, new Date().toISOString()
        );

        // Update advance
        await prisma.$executeRawUnsafe(
          `UPDATE advance_payments SET due_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
          newDue, newStatus, new Date().toISOString(), adv.id
        );

        advanceDeduction += recoveryAmount;
        remaining -= recoveryAmount;
      }

      netAmount -= advanceDeduction;
    }

    const id = cuid();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO salary_payments (id, company_id, staff_id, amount, month, payment_date, payment_method, reference_no, deductions, bonus, net_amount, status, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
      id, params.companyId, staffId, amount, month, paymentDate,
      paymentMethod || "cash", referenceNo || null,
      dedAmt + advanceDeduction, bonusAmt, netAmount,
      notes || null, session.user.id, now, now
    );

    // Also create a corresponding expense transaction for accounting
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, company_id, type, amount, particulars, date, payment_method, reference_no, created_by, source, created_at, updated_at)
       VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, 'web', ?, ?)`,
      txnId, params.companyId, netAmount,
      `Salary: ${month}${advanceDeduction > 0 ? ` (Advance deducted: ${advanceDeduction})` : ""}`,
      paymentDate, paymentMethod || "cash", referenceNo || null,
      session.user.id, now, now
    );

    // Update salary_payment with transaction link (notes field)
    await prisma.$executeRawUnsafe(
      `UPDATE salary_payments SET notes = COALESCE(notes, '') || ? WHERE id = ?`,
      advanceDeduction > 0 ? ` | Advance recovery: ${advanceDeduction} | Txn: ${txnId}` : ` | Txn: ${txnId}`,
      id
    );

    // Get company currency for Slack
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT name, currency FROM companies WHERE id = ?`, params.companyId
    );
    const currency = company[0]?.currency || "NPR";
    const staffInfo: any[] = await prisma.$queryRawUnsafe(
      `SELECT name FROM staff WHERE id = ?`, staffId
    );

    notifySlack(
      params.companyId,
      `💰 *Salary Paid* to *${staffInfo[0]?.name || "Staff"}* for ${month}\n` +
      `> Gross: ${formatCurrency(amount, currency)} | Deductions: ${formatCurrency(dedAmt + advanceDeduction, currency)} | Net: ${formatCurrency(netAmount, currency)}\n` +
      `> Method: ${paymentMethod || "cash"}${advanceDeduction > 0 ? ` | Advance recovered: ${formatCurrency(advanceDeduction, currency)}` : ""}`
    ).catch(() => {});

    return NextResponse.json({
      id,
      netAmount,
      advanceDeduction,
      transactionId: txnId,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /salary-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
