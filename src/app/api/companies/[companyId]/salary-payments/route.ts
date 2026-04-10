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

    const conditions: string[] = ["sp.company_id = ?"];
    const values: any[] = [params.companyId];

    if (staffId) { conditions.push("sp.staff_id = ?"); values.push(staffId); }
    if (month) { conditions.push("sp.month = ?"); values.push(month); }
    if (status) { conditions.push("sp.status = ?"); values.push(status); }

    const whereClause = conditions.join(" AND ");

    const payments: any[] = await prisma.$queryRawUnsafe(
      `SELECT sp.*, s.name as staff_name, s.role as staff_role, s.salary_amount as agreed_salary,
              u.name as created_by_name
       FROM salary_payments sp
       LEFT JOIN staff s ON s.id = sp.staff_id
       LEFT JOIN users u ON u.id = sp.created_by
       WHERE ${whereClause}
       ORDER BY sp.payment_date DESC, s.name ASC`,
      ...values
    );

    // Summary for the month filter
    const summaryConditions: string[] = ["company_id = ?"];
    const summaryValues: any[] = [params.companyId];
    if (month) { summaryConditions.push("month = ?"); summaryValues.push(month); }

    const summary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_count,
              COALESCE(SUM(net_amount), 0) as total_paid,
              COALESCE(SUM(deductions), 0) as total_deductions,
              COALESCE(SUM(bonus), 0) as total_bonus
       FROM salary_payments WHERE ${summaryConditions.join(" AND ")}`,
      ...summaryValues
    );

    // Convert BigInt values from Prisma/SQLite to plain numbers for JSON serialization
    const rawSummary = summary[0] || {};
    const safeSummary = {
      total_count: Number(rawSummary.total_count || 0),
      total_paid: Number(rawSummary.total_paid || 0),
      total_deductions: Number(rawSummary.total_deductions || 0),
      total_bonus: Number(rawSummary.total_bonus || 0),
    };

    return NextResponse.json({
      payments: payments.map((p: any) => ({
        id: p.id,
        staff_id: p.staff_id,
        staffName: p.staff_name || "Unknown",
        staffRole: p.staff_role || "staff",
        agreedSalary: Number(p.agreed_salary || 0),
        amount: Number(p.amount),
        month: p.month,
        paymentDate: p.payment_date,
        paymentMethod: p.payment_method,
        referenceNo: p.reference_no,
        deductions: Number(p.deductions || 0),
        bonus: Number(p.bonus || 0),
        netAmount: Number(p.net_amount),
        status: p.status,
        notes: p.notes,
        attachmentUrl: p.attachment_url || "",
        createdByName: p.created_by_name || "System",
        createdBy: p.created_by,
        createdAt: p.created_at,
      })),
      summary: safeSummary,
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
    const {
      staffId, amount, month, paymentDate, paymentMethod,
      referenceNo, deductions, bonus, notes, autoDeductAdvance,
      customDeductions, // { fieldName: amount } from settings
      attachmentUrl,
    } = body;

    if (!staffId || !amount || !month || !paymentDate) {
      return NextResponse.json({ error: "staffId, amount, month, paymentDate are required" }, { status: 400 });
    }

    const grossAmount = Number(amount);
    const bonusAmt = Number(bonus) || 0;

    // Calculate custom deductions total
    let customDedTotal = 0;
    const customDedNotes: string[] = [];
    if (customDeductions && typeof customDeductions === "object") {
      for (const [field, val] of Object.entries(customDeductions)) {
        const v = Number(val) || 0;
        if (v > 0) {
          customDedTotal += v;
          customDedNotes.push(`${field}: ${v}`);
        }
      }
    }

    const baseDed = Number(deductions) || 0;
    let totalDeductions = baseDed + customDedTotal;
    let netAmount = grossAmount - totalDeductions + bonusAmt;

    // Auto-deduct pending advances if requested
    let advanceDeduction = 0;
    if (autoDeductAdvance) {
      const pendingAdvances: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, due_amount FROM advance_payments WHERE staff_id = ? AND status != 'recovered' AND due_amount > 0 ORDER BY payment_date ASC`,
        staffId
      );

      let remaining = grossAmount * 0.25; // max 25% of gross for advance recovery
      for (const adv of pendingAdvances) {
        if (remaining <= 0) break;
        const advDue = Number(adv.due_amount);
        const recoveryAmount = Math.min(advDue, remaining);
        const newDue = advDue - recoveryAmount;
        const newStatus = newDue <= 0.01 ? "recovered" : "partially_recovered";

        const recId = "ar" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const now2 = new Date().toISOString();
        await prisma.$executeRawUnsafe(
          `INSERT INTO advance_recoveries (id, advance_id, amount, recovery_date, recovery_method, notes, created_by, created_at)
           VALUES ('${recId}', '${adv.id}', ${recoveryAmount}, '${paymentDate}', 'salary_deduction', 'Auto-deducted from ${month} salary', '${session.user.id}', '${now2}')`
        );
        await prisma.$executeRawUnsafe(
          `UPDATE advance_payments SET due_amount = ${newDue}, status = '${newStatus}', updated_at = '${now2}' WHERE id = '${adv.id}'`
        );

        advanceDeduction += recoveryAmount;
        remaining -= recoveryAmount;
      }

      totalDeductions += advanceDeduction;
      netAmount -= advanceDeduction;
    }

    const id = cuid();
    const now = new Date().toISOString();
    const method = paymentMethod || "cash";
    const refNo = referenceNo || "";
    const allNotes = [
      notes || "",
      customDedNotes.length ? `Custom: ${customDedNotes.join(", ")}` : "",
      advanceDeduction > 0 ? `Advance recovery: ${advanceDeduction}` : "",
    ].filter(Boolean).join(" | ");

    // Insert salary payment
    const attachment = (attachmentUrl || "").replace(/'/g, "''");
    await prisma.$executeRawUnsafe(
      `INSERT INTO salary_payments
        (id, company_id, staff_id, amount, month, payment_date, payment_method, reference_no, deductions, bonus, net_amount, status, notes, attachment_url, created_by, created_at, updated_at)
       VALUES
        ('${id}', '${params.companyId}', '${staffId}', ${grossAmount}, '${month}', '${paymentDate}', '${method}', '${refNo}', ${totalDeductions}, ${bonusAmt}, ${netAmount}, 'paid', '${allNotes.replace(/'/g, "''")}', ${attachment ? `'${attachment}'` : "NULL"}, '${session.user.id}', '${now}', '${now}')`
    );

    // Also create a corresponding expense transaction
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      const particulars = `Salary: ${month}${advanceDeduction > 0 ? ` (Adv deducted: ${advanceDeduction})` : ""}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO transactions
          (id, company_id, type, amount, particulars, date, payment_method, reference_no, created_by, source, created_at, updated_at)
         VALUES
          ('${txnId}', '${params.companyId}', 'expense', ${netAmount}, '${particulars.replace(/'/g, "''")}', '${paymentDate}', '${method}', '${refNo}', '${session.user.id}', 'web', '${now}', '${now}')`
      );
    } catch (txnErr) {
      console.error("Failed to create linked transaction:", txnErr);
    }

    // Slack
    try {
      const company: any[] = await prisma.$queryRawUnsafe(`SELECT name, currency FROM companies WHERE id = ?`, params.companyId);
      const currency = company[0]?.currency || "NPR";
      const staffInfo: any[] = await prisma.$queryRawUnsafe(`SELECT name FROM staff WHERE id = ?`, staffId);

      notifySlack(
        params.companyId,
        `💰 *Salary Paid* to *${staffInfo[0]?.name || "Staff"}* for ${month}\n` +
        `> Gross: ${formatCurrency(grossAmount, currency)} | Deductions: ${formatCurrency(totalDeductions, currency)} | Net: ${formatCurrency(netAmount, currency)}\n` +
        `> Method: ${method}${advanceDeduction > 0 ? ` | Advance recovered: ${formatCurrency(advanceDeduction, currency)}` : ""}`
      ).catch(() => {});
    } catch {}

    return NextResponse.json({
      id,
      netAmount,
      advanceDeduction,
      totalDeductions,
      transactionId: txnId,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /salary-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
