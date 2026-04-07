import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({
    where: { userId, companyId },
  });
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

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const categoryId = url.searchParams.get("categoryId");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const paymentMethod = url.searchParams.get("paymentMethod");
    const isReconciled = url.searchParams.get("isReconciled");
    const search = url.searchParams.get("search");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "20"));

    // Build where clause — date is stored as YYYY-MM-DD string
    const where: any = { companyId: params.companyId };

    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom; // string comparison works for YYYY-MM-DD
      if (dateTo) where.date.lte = dateTo;
    }

    if (isReconciled === "true" || isReconciled === "false") {
      where.isReconciled = isReconciled === "true";
    }

    if (search) {
      where.particulars = { contains: search };
    }

    const total = await prisma.transaction.count({ where });

    const transactions = await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /transactions error:", error);
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

    // Viewers cannot create entries
    if (access.role === "viewer") {
      return NextResponse.json({ error: "Viewers cannot create entries" }, { status: 403 });
    }

    const body = await request.json();
    const { type, amount, categoryId, particulars, date, paymentMethod, referenceNo, attachmentUrl } = body;

    if (!type || !amount || !date) {
      return NextResponse.json({ error: "Missing required fields: type, amount, date" }, { status: 400 });
    }

    if (!["income", "expense"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const transaction = await prisma.transaction.create({
      data: {
        companyId: params.companyId,
        type,
        amount: parseFloat(amount),
        categoryId: categoryId || null,
        particulars: particulars || null,
        date, // stored as YYYY-MM-DD string
        paymentMethod: paymentMethod || null,
        referenceNo: referenceNo || null,
        attachmentUrl: attachmentUrl || null,
        createdById: session.user.id,
        source: "web",
      },
      include: { category: true },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId: params.companyId,
        action: "create",
        entityType: "transaction",
        entityId: transaction.id,
        newValues: JSON.stringify(transaction),
      },
    });

    // Slack notification (best-effort, fire and forget)
    try {
      const company = await prisma.company.findUnique({
        where: { id: params.companyId },
        select: { name: true, currency: true },
      });
      const author = session.user.name || "Someone";
      const emoji = type === "income" ? ":moneybag:" : ":money_with_wings:";
      const label = type === "income" ? "Income" : "Expense";
      const formatted = formatCurrency(parseFloat(amount), company?.currency || "NPR");
      const text =
        `${emoji} New *${label}* added to *${company?.name || "company"}* by *${author}*\n` +
        `Amount: *${formatted}*\n` +
        `Description: ${particulars || "—"}\n` +
        `Category: ${transaction.category?.name || "—"}\n` +
        `Payment: ${paymentMethod || "—"}\n` +
        `Date: ${date}`;
      notifySlack(params.companyId, text).catch(() => {});
    } catch {}

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("POST /transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
