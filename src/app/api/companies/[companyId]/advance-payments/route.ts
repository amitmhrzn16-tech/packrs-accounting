import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";
import { createEntryLog } from "@/lib/entry-log";

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

    // Build parameterized query
    const conditions: string[] = ["ap.company_id = ?"];
    const values: any[] = [params.companyId];

    if (staffId) {
      conditions.push("ap.staff_id = ?");
      values.push(staffId);
    }
    if (status) {
      conditions.push("ap.status = ?");
      values.push(status);
    }

    const whereClause = conditions.join(" AND ");

    const advances: any[] = await prisma.$queryRawUnsafe(
      `SELECT ap.*, s.name as staff_name, s.role as staff_role,
              u.name as created_by_name, u2.name as approved_by_name
       FROM advance_payments ap
       LEFT JOIN staff s ON s.id = ap.staff_id
       LEFT JOIN users u ON u.id = ap.created_by
       LEFT JOIN users u2 ON u2.id = ap.approved_by
       WHERE ${whereClause}
       ORDER BY ap.created_at DESC`,
      ...values
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
          id: a.id,
          staff_id: a.staff_id,
          staffName: a.staff_name || "Unknown",
          staffRole: a.staff_role || "staff",
          amount: Number(a.amount),
          paymentDate: a.payment_date,
          paymentMethod: a.payment_method,
          referenceNo: a.reference_no,
          reason: a.reason,
          dueAmount: Number(a.due_amount),
          status: a.status,
          recoveryDeadline: a.recovery_deadline,
          notes: a.notes,
          createdByName: a.created_by_name || "System",
          createdBy: a.created_by,
          createdAt: a.created_at,
          attachmentUrl: a.attachment_url || "",
          interestRate: a.interest_rate ? Number(a.interest_rate) : null,
          interestAmount: a.interest_amount ? Number(a.interest_amount) : null,
          totalWithInterest: a.total_with_interest ? Number(a.total_with_interest) : null,
          customDeductionAmount: a.custom_deduction_amount ? Number(a.custom_deduction_amount) : null,
          approvalStatus: a.approval_status || "pending",
          approvedBy: a.approved_by || null,
          approvedByName: a.approved_by_name || null,
          approvedAt: a.approved_at || null,
          recoveries: recoveries.map((r: any) => ({
            id: r.id,
            amount: Number(r.amount),
            recoveryDate: r.recovery_date,
            recoveryMethod: r.recovery_method,
            notes: r.notes,
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
       FROM advance_payments WHERE company_id = ?`,
      params.companyId
    );

    // Convert BigInt values from Prisma/SQLite to plain numbers for JSON serialization
    const rawSummary = summary[0] || {};
    const safeSummary = {
      total_advances: Number(rawSummary.total_advances || 0),
      total_given: Number(rawSummary.total_given || 0),
      total_outstanding: Number(rawSummary.total_outstanding || 0),
      total_recovered: Number(rawSummary.total_recovered || 0),
    };

    return NextResponse.json({
      advances: advancesWithRecoveries,
      summary: safeSummary,
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

    // Handle admin alert action (Slack notification for over-limit advances)
    if (body.action === "admin_alert") {
      const { staffName, amount: alertAmt, monthTotal, limit, unpaidCount, unpaidTotal } = body;
      try {
        const company: any[] = await prisma.$queryRawUnsafe(`SELECT currency FROM companies WHERE id = ?`, params.companyId);
        const currency = company[0]?.currency || "NPR";
        await notifySlack(
          params.companyId,
          `🚨 *ADVANCE LIMIT EXCEEDED — Admin Approval Required*\n` +
          `> Staff: *${staffName}*\n` +
          `> Requested: ${formatCurrency(Number(alertAmt), currency)}\n` +
          `> Monthly Total (after this): ${formatCurrency(Number(monthTotal), currency)} — Limit: ${formatCurrency(Number(limit), currency)}\n` +
          `> Unpaid advances: ${unpaidCount} totaling ${formatCurrency(Number(unpaidTotal), currency)}\n` +
          `> ⚠️ Please verify and approve/deny this advance request.`
        );
      } catch {}
      return NextResponse.json({ sent: true });
    }

    const { staffId, amount, paymentDate, paymentMethod, referenceNo, reason, recoveryDeadline, notes, attachmentUrl, interestRate, customDeductionAmount } = body;

    if (!staffId || !amount || !paymentDate) {
      return NextResponse.json({ error: "staffId, amount, paymentDate are required" }, { status: 400 });
    }

    const id = cuid();
    const now = new Date().toISOString();
    const method = paymentMethod || "cash";
    const refNo = referenceNo || "";
    const reasonText = reason || "";
    const deadline = recoveryDeadline || "";
    const noteText = notes || "";
    const attachment = (attachmentUrl || "").replace(/'/g, "''");

    // Calculate interest
    const baseAmount = Number(amount);
    const intRate = interestRate ? Number(interestRate) : 0;
    const intAmount = intRate > 0 ? baseAmount * (intRate / 100) : 0;
    const totalWithInt = baseAmount + intAmount;
    const customDed = customDeductionAmount ? Number(customDeductionAmount) : null;

    // Use explicit SQL with no null params — SQLite/Prisma can be fussy with null bindings
    await prisma.$executeRawUnsafe(
      `INSERT INTO advance_payments
        (id, company_id, staff_id, amount, payment_date, payment_method, reference_no, reason, due_amount, status, recovery_deadline, notes, attachment_url, interest_rate, interest_amount, total_with_interest, custom_deduction_amount, approval_status, created_by, created_at, updated_at)
       VALUES
        ('${id}', '${params.companyId}', '${staffId}', ${baseAmount}, '${paymentDate}', '${method}', '${refNo}', '${reasonText}', ${totalWithInt}, 'due', '${deadline}', '${noteText}', ${attachment ? `'${attachment}'` : "NULL"}, ${intRate > 0 ? intRate : "NULL"}, ${intAmount > 0 ? intAmount : "NULL"}, ${totalWithInt > baseAmount ? totalWithInt : "NULL"}, ${customDed !== null ? customDed : "NULL"}, 'pending', '${session.user.id}', '${now}', '${now}')`
    );

    // Verify the insert succeeded
    const verify: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM advance_payments WHERE id = ?`, id
    );
    if (!verify.length) {
      return NextResponse.json({ error: "Failed to create advance payment — database insert failed" }, { status: 500 });
    }

    // Create entry log
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: 'advance',
        entryId: id,
        action: 'created',
        performedBy: session.user.id,
        performedByName: session.user.name || '',
      });
    } catch (logErr) {
      console.error("Failed to create entry log:", logErr);
    }

    // Create expense transaction for accounting
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO transactions
          (id, company_id, type, amount, particulars, date, payment_method, reference_no, created_by, source, created_at, updated_at)
         VALUES
          ('${txnId}', '${params.companyId}', 'expense', ${baseAmount}, 'Advance: ${reasonText.replace(/'/g, "''")}', '${paymentDate}', '${method}', '${refNo}', '${session.user.id}', 'web', '${now}', '${now}')`
      );
    } catch (txnErr) {
      console.error("Failed to create linked transaction (advance still created):", txnErr);
    }

    // Slack notification (fire-and-forget)
    try {
      const staffInfo: any[] = await prisma.$queryRawUnsafe(`SELECT name FROM staff WHERE id = ?`, staffId);
      const company: any[] = await prisma.$queryRawUnsafe(`SELECT currency FROM companies WHERE id = ?`, params.companyId);
      const currency = company[0]?.currency || "NPR";

      notifySlack(
        params.companyId,
        `⚠️ *Advance Given* to *${staffInfo[0]?.name || "Staff"}*\n` +
        `> Amount: ${formatCurrency(baseAmount, currency)} | Method: ${method}\n` +
        `> Status: *PENDING APPROVAL*${intRate > 0 ? ` | Interest: ${intRate}% (${formatCurrency(intAmount, currency)})` : ""}${deadline ? ` | Deadline: ${deadline}` : ""}\n` +
        `> ${reasonText || "No reason specified"}`
      ).catch(() => {});
    } catch {}

    return NextResponse.json({ id, dueAmount: totalWithInt, transactionId: txnId }, { status: 201 });
  } catch (error) {
    console.error("POST /advance-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// PUT — edit, approve, or reject advance payment
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
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    // Verify the advance belongs to this company
    const advance: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM advance_payments WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );
    if (!advance.length) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "edit") {
      // Edit advance details and recalculate interest
      const { amount, reason, interestRate, customDeductionAmount } = body;

      const updates: string[] = [];
      const values: any[] = [];

      if (amount !== undefined) {
        const baseAmount = Number(amount);
        const intRate = interestRate !== undefined ? Number(interestRate) : null;
        const intAmount = intRate !== null && intRate > 0 ? baseAmount * (intRate / 100) : 0;
        const totalWithInt = baseAmount + intAmount;

        updates.push(`amount = ?, interest_rate = ?, interest_amount = ?, total_with_interest = ?, due_amount = ?`);
        values.push(baseAmount, intRate > 0 ? intRate : null, intAmount > 0 ? intAmount : null, totalWithInt > baseAmount ? totalWithInt : null, totalWithInt);
      } else if (interestRate !== undefined) {
        // Update interest rate only
        const currentAdvance: any[] = await prisma.$queryRawUnsafe(
          `SELECT amount FROM advance_payments WHERE id = ?`,
          id
        );
        const baseAmount = Number(currentAdvance[0]?.amount || 0);
        const intRate = Number(interestRate);
        const intAmount = intRate > 0 ? baseAmount * (intRate / 100) : 0;
        const totalWithInt = baseAmount + intAmount;

        updates.push(`interest_rate = ?, interest_amount = ?, total_with_interest = ?, due_amount = ?`);
        values.push(intRate > 0 ? intRate : null, intAmount > 0 ? intAmount : null, totalWithInt > baseAmount ? totalWithInt : null, totalWithInt);
      }

      if (reason !== undefined) {
        updates.push(`reason = ?`);
        values.push(reason);
      }

      if (customDeductionAmount !== undefined) {
        updates.push(`custom_deduction_amount = ?`);
        values.push(customDeductionAmount);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = ?`);
        values.push(now);
        values.push(id);

        const updateClause = updates.join(", ");
        await prisma.$executeRawUnsafe(
          `UPDATE advance_payments SET ${updateClause} WHERE id = ?`,
          ...values
        );
      }

      // Create entry log for edit
      try {
        await createEntryLog({
          companyId: params.companyId,
          module: 'advance',
          entryId: id,
          action: 'edited',
          performedBy: session.user.id,
          performedByName: session.user.name || '',
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id });
    } else if (action === "approve") {
      // Approve the advance
      await prisma.$executeRawUnsafe(
        `UPDATE advance_payments SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
        'approved',
        session.user.id,
        now,
        now,
        id
      );

      // Create entry log for approval
      try {
        await createEntryLog({
          companyId: params.companyId,
          module: 'advance',
          entryId: id,
          action: 'approved',
          performedBy: session.user.id,
          performedByName: session.user.name || '',
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id, approvalStatus: 'approved' });
    } else if (action === "reject") {
      // Reject the advance
      await prisma.$executeRawUnsafe(
        `UPDATE advance_payments SET approval_status = ?, updated_at = ? WHERE id = ?`,
        'rejected',
        now,
        id
      );

      // Create entry log for rejection
      try {
        await createEntryLog({
          companyId: params.companyId,
          module: 'advance',
          entryId: id,
          action: 'rejected',
          performedBy: session.user.id,
          performedByName: session.user.name || '',
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id, approvalStatus: 'rejected' });
    } else {
      return NextResponse.json({ error: "Invalid action. Use 'edit', 'approve', or 'reject'" }, { status: 400 });
    }
  } catch (error) {
    console.error("PUT /advance-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// DELETE — delete an advance payment and its linked transaction
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

    // Verify the advance belongs to this company
    const advance: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM advance_payments WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );
    if (!advance.length) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }

    // Delete linked transactions (fire-and-forget, non-critical)
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM transactions WHERE source = ? AND reference_no IN (
          SELECT reference_no FROM advance_payments WHERE id = ?
        )`,
        'advance',
        id
      );
    } catch (txnErr) {
      console.error("Failed to delete linked transaction:", txnErr);
    }

    // Delete the advance payment
    await prisma.$executeRawUnsafe(
      `DELETE FROM advance_payments WHERE id = ?`,
      id
    );

    // Create entry log for deletion
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: 'advance',
        entryId: id,
        action: 'deleted',
        performedBy: session.user.id,
        performedByName: session.user.name || '',
      });
    } catch (logErr) {
      console.error("Failed to create entry log:", logErr);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /advance-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
