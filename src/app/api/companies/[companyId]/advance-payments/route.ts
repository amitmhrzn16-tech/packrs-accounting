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
              u.name as created_by_name
       FROM advance_payments ap
       LEFT JOIN staff s ON s.id = ap.staff_id
       LEFT JOIN users u ON u.id = ap.created_by
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

    const { staffId, amount, paymentDate, paymentMethod, referenceNo, reason, recoveryDeadline, notes, attachmentUrl } = body;

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

    // Use explicit SQL with no null params — SQLite/Prisma can be fussy with null bindings
    await prisma.$executeRawUnsafe(
      `INSERT INTO advance_payments
        (id, company_id, staff_id, amount, payment_date, payment_method, reference_no, reason, due_amount, status, recovery_deadline, notes, attachment_url, created_by, created_at, updated_at)
       VALUES
        ('${id}', '${params.companyId}', '${staffId}', ${Number(amount)}, '${paymentDate}', '${method}', '${refNo}', '${reasonText}', ${Number(amount)}, 'due', '${deadline}', '${noteText}', ${attachment ? `'${attachment}'` : "NULL"}, '${session.user.id}', '${now}', '${now}')`
    );

    // Verify the insert succeeded
    const verify: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM advance_payments WHERE id = ?`, id
    );
    if (!verify.length) {
      return NextResponse.json({ error: "Failed to create advance payment — database insert failed" }, { status: 500 });
    }

    // Create expense transaction for accounting
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO transactions
          (id, company_id, type, amount, particulars, date, payment_method, reference_no, created_by, source, created_at, updated_at)
         VALUES
          ('${txnId}', '${params.companyId}', 'expense', ${Number(amount)}, 'Advance: ${reasonText.replace(/'/g, "''")}', '${paymentDate}', '${method}', '${refNo}', '${session.user.id}', 'web', '${now}', '${now}')`
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
        `> Amount: ${formatCurrency(Number(amount), currency)} | Method: ${method}\n` +
        `> Status: *DUE* (auto-set as receivable)${deadline ? ` | Deadline: ${deadline}` : ""}\n` +
        `> ${reasonText || "No reason specified"}`
      ).catch(() => {});
    } catch {}

    return NextResponse.json({ id, dueAmount: Number(amount), transactionId: txnId }, { status: 201 });
  } catch (error) {
    console.error("POST /advance-payments error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
