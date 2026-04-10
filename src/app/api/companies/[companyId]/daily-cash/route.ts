import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";

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
    const { staffId, date, amount, category, description, receiptNo, approvedBy, status, paymentMethod, fonepayRef } = body;

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

    // Use string interpolation to avoid Prisma/SQLite null binding issues
    await prisma.$executeRawUnsafe(
      `INSERT INTO daily_cash_payments (id, company_id, staff_id, date, amount, category, description, receipt_no, payment_method, fonepay_ref, approved_by, status, created_by, created_at, updated_at)
       VALUES ('${id}', '${params.companyId}', ${staffVal ? `'${staffVal}'` : "NULL"}, '${date}', ${Number(amount)}, '${cat}', '${desc}', '${receipt}', '${method}', '${fpRef}', ${approver ? `'${approver}'` : "NULL"}, '${statusVal}', '${session.user.id}', '${now}', '${now}')`
    );

    // Create expense transaction for accounting
    const txnId = "t" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const particulars = `Daily Cash: ${cat}${desc ? ` - ${desc}` : ""}${method === "fonepay" ? ` (Fonepay: ${fpRef})` : ""}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO transactions (id, company_id, type, amount, particulars, date, payment_method, created_by, source, created_at, updated_at)
       VALUES ('${txnId}', '${params.companyId}', 'expense', ${Number(amount)}, '${particulars.replace(/'/g, "''")}', '${date}', '${method}', '${session.user.id}', 'web', '${now}', '${now}')`
    );

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

// PUT — update daily cash payment (for approval/rejection)
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
    const { id: paymentId, status: newStatus, approvedBy } = body;

    if (!paymentId || !newStatus) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE daily_cash_payments SET status = ?, approved_by = ?, updated_at = ? WHERE id = ? AND company_id = ?`,
      newStatus, approvedBy || session.user.id, new Date().toISOString(), paymentId, params.companyId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /daily-cash error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
