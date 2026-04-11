import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";
import { createEntryLog } from "@/lib/entry-log";

function cuid() {
  return "dc" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list daily cash payments with filters
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
    const date = url.searchParams.get("date");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const staffId = url.searchParams.get("staffId");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");

    let where = `dc.company_id = '${params.companyId}'`;
    if (date) where += ` AND dc.date = '${date}'`;
    if (dateFrom) where += ` AND dc.date >= '${dateFrom}'`;
    if (dateTo) where += ` AND dc.date <= '${dateTo}'`;
    if (staffId) where += ` AND dc.staff_id = '${staffId}'`;
    if (category) where += ` AND dc.category = '${category}'`;
    if (status) where += ` AND dc.status = '${status}'`;

    const payments: any[] = await prisma.$queryRawUnsafe(
      `SELECT dc.*, s.name as staff_name, s.role as staff_role,
              u.name as created_by_name
       FROM daily_cash_payments dc
       LEFT JOIN staff s ON s.id = dc.staff_id
       LEFT JOIN users u ON u.id = dc.created_by
       WHERE ${where}
       ORDER BY dc.date DESC, dc.created_at DESC`
    );

    // Summary by category for the selected date range
    let summaryWhere = `company_id = '${params.companyId}'`;
    if (date) summaryWhere += ` AND date = '${date}'`;
    if (dateFrom) summaryWhere += ` AND date >= '${dateFrom}'`;
    if (dateTo) summaryWhere += ` AND date <= '${dateTo}'`;

    const categorySummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM daily_cash_payments WHERE ${summaryWhere} AND status = 'approved'
       GROUP BY category ORDER BY total DESC`
    );

    const totalSummary: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount
       FROM daily_cash_payments WHERE ${summaryWhere} AND status = 'approved'`
    );

    // Convert BigInt values from Prisma/SQLite to plain numbers for JSON serialization
    const safeCategorySummary = categorySummary.map((cs: any) => ({
      category: cs.category,
      count: Number(cs.count),
      total: Number(cs.total),
    }));
    const rawSummary = totalSummary[0] || {};
    const safeSummary = {
      total_count: Number(rawSummary.total_count || 0),
      total_amount: Number(rawSummary.total_amount || 0),
    };

    return NextResponse.json({
      payments: payments.map((p: any) => ({
        id: p.id,
        staff_id: p.staff_id,
        staffName: p.staff_name || "",
        staffRole: p.staff_role || "",
        date: p.date,
        amount: Number(p.amount),
        category: p.category,
        description: p.description,
        receiptNo: p.receipt_no,
        approvedBy: p.approved_by,
        status: p.status,
        paymentMethod: p.payment_method || "cash",
        fonepayRef: p.fonepay_ref || "",
        attachmentUrl: p.attachment_url || "",
        createdByName: p.created_by_name || "",
        createdAt: p.created_at,
      })),
      categorySummary: safeCategorySummary,
      summary: safeSummary,
    });
  } catch (error) {
    console.error("GET /daily-cash error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create daily cash payment
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
    const { staffId, date, amount, category, description, receiptNo, approvedBy, status, paymentMethod, fonepayRef, attachmentUrl } = body;

    if (!date || !amount) {
      return NextResponse.json({ error: "date and amount are required" }, { status: 400 });
    }

    const id = cuid();
    const now = new Date().toISOString();
    const cat = category || "general";
    const desc = (description || "").replace(/'/g, "''");
    const receipt = (receiptNo || "").replace(/'/g, "''");
    const method = paymentMethod || "cash";
    const fpRef = (fonepayRef || "").replace(/'/g, "''");
    const staffVal = staffId || "";
    const approver = approvedBy || "";
    const statusVal = status || "approved";
    const attachment = (attachmentUrl || "").replace(/'/g, "''");

    // Use string interpolation to avoid Prisma/SQLite null binding issues
    await prisma.$executeRawUnsafe(
      `INSERT INTO daily_cash_payments (id, company_id, staff_id, date, amount, category, description, receipt_no, payment_method, fonepay_ref, approved_by, status, attachment_url, created_by, created_at, updated_at)
       VALUES ('${id}', '${params.companyId}', ${staffVal ? `'${staffVal}'` : "NULL"}, '${date}', ${Number(amount)}, '${cat}', '${desc}', '${receipt}', '${method}', '${fpRef}', ${approver ? `'${approver}'` : "NULL"}, '${statusVal}', ${attachment ? `'${attachment}'` : "NULL"}, '${session.user.id}', '${now}', '${now}')`
    );

    // Create transaction: income for cash_collection/fonepay, expense for others
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const txnType = (cat === "cash_collection" || cat === "fonepay") ? "income" : "expense";
    const particulars = `Daily Cash: ${cat}${desc ? ` - ${desc}` : ""}${method === "fonepay" ? ` (Fonepay: ${fpRef})` : ""}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, company_id, type, amount, particulars, date, payment_method, created_by, source, created_at, updated_at)
       VALUES ('${txnId}', '${params.companyId}', '${txnType}', ${Number(amount)}, '${particulars.replace(/'/g, "''")}', '${date}', '${method}', '${session.user.id}', 'web', '${now}', '${now}')`
    );

    // Update daily_cash_payments with synced_txn_id
    await prisma.$executeRawUnsafe(
      `UPDATE daily_cash_payments SET synced_txn_id = '${txnId}' WHERE id = '${id}'`
    );

    // Create entry log
    await createEntryLog({
      companyId: params.companyId,
      module: "daily_cash",
      entryId: id,
      action: "created",
      performedBy: session.user.id,
      performedByName: session.user.name || "",
    });

    // Slack
    const company: any[] = await prisma.$queryRawUnsafe(`SELECT currency FROM companies WHERE id = ?`, params.companyId);
    const currency = company[0]?.currency || "NPR";
    let staffName = "General";
    if (staffId) {
      const s: any[] = await prisma.$queryRawUnsafe(`SELECT name FROM staff WHERE id = ?`, staffId);
      staffName = s[0]?.name || "Staff";
    }

    notifySlack(
      params.companyId,
      `💵 *Daily Cash ${cat === "cash_collection" ? "Collection" : "Payment"}*\n` +
      `> ${formatCurrency(Number(amount), currency)} | ${cat} | ${staffName}\n` +
      `> Method: ${method}${method === "fonepay" && fpRef ? ` (Ref: ${fpRef})` : ""}\n` +
      `> ${desc || "No description"} | Date: ${date}`
    ).catch(() => {});

    return NextResponse.json({ id, transactionId: txnId }, { status: 201 });
  } catch (error) {
    console.error("POST /daily-cash error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — update daily cash payment (edit, approve, reject)
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
    const { id: paymentId, action, status: newStatus, approvedBy, date, amount, category, description, receiptNo, paymentMethod, fonepayRef, attachmentUrl } = body;

    if (!paymentId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Handle edit action
    if (action === "edit") {
      const updates: string[] = [];
      if (date) updates.push(`date = '${date}'`);
      if (amount) updates.push(`amount = ${Number(amount)}`);
      if (category) updates.push(`category = '${category}'`);
      if (description !== undefined) updates.push(`description = '${description.replace(/'/g, "''")}'`);
      if (receiptNo !== undefined) updates.push(`receipt_no = '${receiptNo.replace(/'/g, "''")}'`);
      if (paymentMethod) updates.push(`payment_method = '${paymentMethod}'`);
      if (fonepayRef !== undefined) updates.push(`fonepay_ref = '${fonepayRef.replace(/'/g, "''")}'`);
      if (attachmentUrl !== undefined) updates.push(`attachment_url = ${attachmentUrl ? `'${attachmentUrl.replace(/'/g, "''")}'` : "NULL"}`);
      updates.push(`updated_at = '${now}'`);

      if (updates.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE daily_cash_payments SET ${updates.join(", ")} WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
        );

        await createEntryLog({
          companyId: params.companyId,
          module: "daily_cash",
          entryId: paymentId,
          action: "edited",
          performedBy: session.user.id,
          performedByName: session.user.name || "",
        });
      }
    }
    // Handle approve action
    else if (action === "approve") {
      await prisma.$executeRawUnsafe(
        `UPDATE daily_cash_payments SET status = 'approved', approved_by = '${approvedBy || session.user.id}', approved_at = '${now}', updated_at = '${now}' WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
      );

      await createEntryLog({
        companyId: params.companyId,
        module: "daily_cash",
        entryId: paymentId,
        action: "approved",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
      });
    }
    // Handle reject action
    else if (action === "reject") {
      await prisma.$executeRawUnsafe(
        `UPDATE daily_cash_payments SET status = 'rejected', updated_at = '${now}' WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
      );

      await createEntryLog({
        companyId: params.companyId,
        module: "daily_cash",
        entryId: paymentId,
        action: "rejected",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
      });
    }
    // Legacy status update (backward compatibility)
    else if (newStatus) {
      await prisma.$executeRawUnsafe(
        `UPDATE daily_cash_payments SET status = '${newStatus}', approved_by = ${approvedBy ? `'${approvedBy}'` : `'${session.user.id}'`}, updated_at = '${now}' WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
      );
    }
    else {
      return NextResponse.json({ error: "action or status is required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /daily-cash error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — delete daily cash payment and linked transaction
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
    const paymentId = url.searchParams.get("id");

    if (!paymentId) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    // Get the daily cash payment to check for linked transaction
    const payment: any[] = await prisma.$queryRawUnsafe(
      `SELECT synced_txn_id FROM daily_cash_payments WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
    );

    if (!payment || payment.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const syncedTxnId = payment[0]?.synced_txn_id;

    // Delete linked transaction if it exists
    if (syncedTxnId) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM transactions WHERE id = '${syncedTxnId}' AND company_id = '${params.companyId}'`
      );
    }

    // Delete the daily cash payment
    await prisma.$executeRawUnsafe(
      `DELETE FROM daily_cash_payments WHERE id = '${paymentId}' AND company_id = '${params.companyId}'`
    );

    // Create entry log
    await createEntryLog({
      companyId: params.companyId,
      module: "daily_cash",
      entryId: paymentId,
      action: "deleted",
      performedBy: session.user.id,
      performedByName: session.user.name || "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /daily-cash error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
