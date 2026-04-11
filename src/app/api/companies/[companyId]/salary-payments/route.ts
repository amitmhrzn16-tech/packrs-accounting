import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";
import { createEntryLog } from "@/lib/entry-log";

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
        approvalStatus: p.approval_status || "pending",
        approvedBy: p.approved_by || null,
        approvedAt: p.approved_at || null,
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
      advanceDeductionOverride, // optional override for max advance deduction %
      advanceInterestRate, // flag to calculate interest when recovering advances
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
        `SELECT id, due_amount, interest_rate FROM advance_payments WHERE staff_id = ? AND status != 'recovered' AND due_amount > 0 ORDER BY payment_date ASC`,
        staffId
      );

      // Determine max deduction: override if provided, otherwise default 25%
      const maxDeductionPercent = advanceDeductionOverride !== undefined ? advanceDeductionOverride : 25;
      let remaining = (grossAmount * maxDeductionPercent) / 100;

      for (const adv of pendingAdvances) {
        if (remaining <= 0) break;
        const advDue = Number(adv.due_amount);
        const recoveryAmount = Math.min(advDue, remaining);
        const newDue = advDue - recoveryAmount;
        const newStatus = newDue <= 0.01 ? "recovered" : "partially_recovered";

        const recId = "ar" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const now2 = new Date().toISOString();

        // Calculate interest if advanceInterestRate is set and advance has interest_rate
        let interestPortion = 0;
        let principalPortion = recoveryAmount;

        if (advanceInterestRate && adv.interest_rate) {
          const rate = Number(adv.interest_rate);
          if (rate > 0) {
            interestPortion = recoveryAmount * (rate / (100 + rate));
            principalPortion = recoveryAmount - interestPortion;
          }
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO advance_recoveries (id, advance_id, amount, interest_portion, principal_portion, recovery_date, recovery_method, notes, created_by, created_at)
           VALUES ('${recId}', '${adv.id}', ${recoveryAmount}, ${interestPortion}, ${principalPortion}, '${paymentDate}', 'salary_deduction', 'Auto-deducted from ${month} salary', '${session.user.id}', '${now2}')`
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

    // Insert salary payment with approval_status = 'pending'
    const attachment = (attachmentUrl || "").replace(/'/g, "''");
    await prisma.$executeRawUnsafe(
      `INSERT INTO salary_payments
        (id, company_id, staff_id, amount, month, payment_date, payment_method, reference_no, deductions, bonus, net_amount, status, approval_status, notes, attachment_url, created_by, created_at, updated_at)
       VALUES
        ('${id}', '${params.companyId}', '${staffId}', ${grossAmount}, '${month}', '${paymentDate}', '${method}', '${refNo}', ${totalDeductions}, ${bonusAmt}, ${netAmount}, 'paid', 'pending', '${allNotes.replace(/'/g, "''")}', ${attachment ? `'${attachment}'` : "NULL"}, '${session.user.id}', '${now}', '${now}')`
    );

    // Create entry log
    await createEntryLog({
      companyId: params.companyId,
      module: 'salary',
      entryId: id,
      action: 'created',
      performedBy: session.user.id,
      performedByName: session.user.name || '',
    });

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

// PUT — edit, approve, or reject salary payment
export async function PUT(
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
    const { id, action, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === 'edit') {
      // Update salary payment fields
      const updates: string[] = [];
      const values: any[] = [];

      if (updateFields.amount !== undefined) {
        updates.push("amount = ?");
        values.push(Number(updateFields.amount));
      }
      if (updateFields.month !== undefined) {
        updates.push("month = ?");
        values.push(updateFields.month);
      }
      if (updateFields.paymentDate !== undefined) {
        updates.push("payment_date = ?");
        values.push(updateFields.paymentDate);
      }
      if (updateFields.paymentMethod !== undefined) {
        updates.push("payment_method = ?");
        values.push(updateFields.paymentMethod);
      }
      if (updateFields.referenceNo !== undefined) {
        updates.push("reference_no = ?");
        values.push(updateFields.referenceNo);
      }
      if (updateFields.deductions !== undefined) {
        updates.push("deductions = ?");
        values.push(Number(updateFields.deductions));
      }
      if (updateFields.bonus !== undefined) {
        updates.push("bonus = ?");
        values.push(Number(updateFields.bonus));
      }
      if (updateFields.netAmount !== undefined) {
        updates.push("net_amount = ?");
        values.push(Number(updateFields.netAmount));
      }
      if (updateFields.notes !== undefined) {
        updates.push("notes = ?");
        values.push(updateFields.notes);
      }
      if (updateFields.status !== undefined) {
        updates.push("status = ?");
        values.push(updateFields.status);
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      updates.push("updated_at = ?");
      values.push(now);
      values.push(id);

      await prisma.$executeRawUnsafe(
        `UPDATE salary_payments SET ${updates.join(", ")} WHERE id = ?`,
        ...values
      );

      // Create entry log for edit
      await createEntryLog({
        companyId: params.companyId,
        module: 'salary',
        entryId: id,
        action: 'edited',
        performedBy: session.user.id,
        performedByName: session.user.name || '',
      });

      return NextResponse.json({ success: true, id });
    } else if (action === 'approve') {
      // Approve salary payment
      await prisma.$executeRawUnsafe(
        `UPDATE salary_payments SET approval_status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
        session.user.id,
        now,
        now,
        id
      );

      // Create entry log for approval
      await createEntryLog({
        companyId: params.companyId,
        module: 'salary',
        entryId: id,
        action: 'approved',
        performedBy: session.user.id,
        performedByName: session.user.name || '',
      });

      return NextResponse.json({ success: true, id, approvalStatus: 'approved' });
    } else if (action === 'reject') {
      // Reject salary payment
      await prisma.$executeRawUnsafe(
        `UPDATE salary_payments SET approval_status = 'rejected', updated_at = ? WHERE id = ?`,
        now,
        id
      );

      // Create entry log for rejection
      await createEntryLog({
        companyId: params.companyId,
        module: 'salary',
        entryId: id,
        action: 'rejected',
        performedBy: session.user.id,
        performedByName: session.user.name || '',
      });

      return NextResponse.json({ success: true, id, approvalStatus: 'rejected' });
    } else {
      return NextResponse.json({ error: "action must be 'edit', 'approve', or 'reject'" }, { status: 400 });
    }
  } catch (error) {
    console.error("PUT /salary-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// DELETE — delete salary payment
export async function DELETE(
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
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Get the salary payment to find associated transaction
    const payment: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM salary_payments WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );

    if (payment.length === 0) {
      return NextResponse.json({ error: "Salary payment not found" }, { status: 404 });
    }

    // Delete linked transaction if it exists
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM transactions WHERE source = 'web' AND particulars LIKE '%Salary:%' AND created_by = ? AND DATE(date) = (SELECT DATE(payment_date) FROM salary_payments WHERE id = ?) LIMIT 1`,
        session.user.id,
        id
      );
    } catch (txnErr) {
      console.error("Failed to delete linked transaction:", txnErr);
    }

    // Delete the salary payment
    await prisma.$executeRawUnsafe(
      `DELETE FROM salary_payments WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );

    // Create entry log for deletion
    await createEntryLog({
      companyId: params.companyId,
      module: 'salary',
      entryId: id,
      action: 'deleted',
      performedBy: session.user.id,
      performedByName: session.user.name || '',
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /salary-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
