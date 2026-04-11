import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";
import { formatCurrency } from "@/lib/utils";
import { createEntryLog } from "@/lib/entry-log";

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

    // Fetch approval_status and related fields for each transaction from raw SQL
    const txnIds = transactions.map((t) => t.id);
    let approvalInfo: any[] = [];

    if (txnIds.length > 0) {
      const idList = txnIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
      approvalInfo = await prisma.$queryRawUnsafe(
        `SELECT id, approval_status, approved_by, approved_at FROM transactions WHERE id IN (${idList})`
      );
    }

    // Create a map for quick lookup
    const approvalMap = new Map(approvalInfo.map((a: any) => [a.id, a]));

    // Merge approval info into transactions
    const enrichedTransactions = transactions.map((t: any) => {
      const approval = approvalMap.get(t.id);
      return {
        ...t,
        approvalStatus: approval?.approval_status || "pending",
        approvedBy: approval?.approved_by || null,
        approvedAt: approval?.approved_at || null,
      };
    });

    return NextResponse.json({
      transactions: enrichedTransactions,
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

    // Set approval_status to 'pending' on creation via raw SQL
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET approval_status = 'pending' WHERE id = '${transaction.id.replace(/'/g, "''")}'`
    );

    // Create entry log for transaction creation
    await createEntryLog({
      companyId: params.companyId,
      module: type === "income" ? "income" : "expense",
      entryId: transaction.id,
      action: "created",
      performedBy: session.user.id,
      performedByName: session.user.name || "",
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

    return NextResponse.json({
      ...transaction,
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    // Viewers cannot edit
    if (access.role === "viewer") {
      return NextResponse.json({ error: "Viewers cannot edit entries" }, { status: 403 });
    }

    const body = await request.json();
    const { id, action, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    // Verify transaction belongs to this company
    const txn = await prisma.transaction.findFirst({
      where: { id, companyId: params.companyId },
    });

    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Handle approval/rejection actions
    if (action === "approve" || action === "reject") {
      const newStatus = action === "approve" ? "approved" : "rejected";
      const now = new Date().toISOString();
      const safeName = (session.user.name || "").replace(/'/g, "''");

      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET approval_status = '${newStatus}', approved_by = '${session.user.id.replace(/'/g, "''") }', approved_at = '${now}' WHERE id = '${id.replace(/'/g, "''")}'`
      );

      // Create entry log for approval/rejection
      await createEntryLog({
        companyId: params.companyId,
        module: txn.type === "income" ? "income" : "expense",
        entryId: id,
        action: action === "approve" ? "approved" : "rejected",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
      });

      // Fetch and return updated transaction
      const updated = await prisma.transaction.findUnique({
        where: { id },
        include: { category: true },
      });

      const approval: any = await prisma.$queryRawUnsafe(
        `SELECT approval_status, approved_by, approved_at FROM transactions WHERE id = '${id.replace(/'/g, "''")}'`
      );

      return NextResponse.json({
        ...updated,
        approvalStatus: approval[0]?.approval_status || newStatus,
        approvedBy: approval[0]?.approved_by || session.user.id,
        approvedAt: approval[0]?.approved_at || now,
      });
    }

    // Handle field updates
    const fieldsToUpdate: any = {};
    const fieldChanges: Record<string, { old: any; new: any }> = {};

    // Validate and map updateable fields
    const editableFields = ["date", "amount", "categoryId", "particulars", "paymentMethod", "referenceNo"];

    for (const field of editableFields) {
      if (field in updateFields) {
        const value = updateFields[field];

        // Map camelCase to snake_case for Prisma
        const prismaField = field === "categoryId" ? "categoryId" : field === "paymentMethod" ? "paymentMethod" : field === "referenceNo" ? "referenceNo" : field;
        const currentValue = (txn as any)[prismaField];

        if (value !== currentValue) {
          fieldChanges[field] = { old: currentValue, new: value };

          if (prismaField === "amount") {
            fieldsToUpdate[prismaField] = parseFloat(value);
          } else {
            fieldsToUpdate[prismaField] = value || null;
          }
        }
      }
    }

    // If no changes, return existing transaction
    if (Object.keys(fieldsToUpdate).length === 0) {
      const updated = await prisma.transaction.findUnique({
        where: { id },
        include: { category: true },
      });

      const approval: any = await prisma.$queryRawUnsafe(
        `SELECT approval_status, approved_by, approved_at FROM transactions WHERE id = '${id.replace(/'/g, "''")}'`
      );

      return NextResponse.json({
        ...updated,
        approvalStatus: approval[0]?.approval_status || "pending",
        approvedBy: approval[0]?.approved_by || null,
        approvedAt: approval[0]?.approved_at || null,
      });
    }

    // Update transaction
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...fieldsToUpdate,
        updatedAt: new Date(),
      },
      include: { category: true },
    });

    // Create entry log with field changes
    if (Object.keys(fieldChanges).length > 0) {
      await createEntryLog({
        companyId: params.companyId,
        module: txn.type === "income" ? "income" : "expense",
        entryId: id,
        action: "edited",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
        fieldChanges,
      });
    }

    // Fetch approval info
    const approval: any = await prisma.$queryRawUnsafe(
      `SELECT approval_status, approved_by, approved_at FROM transactions WHERE id = '${id.replace(/'/g, "''")}'`
    );

    return NextResponse.json({
      ...updated,
      approvalStatus: approval[0]?.approval_status || "pending",
      approvedBy: approval[0]?.approved_by || null,
      approvedAt: approval[0]?.approved_at || null,
    });
  } catch (error) {
    console.error("PUT /transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    // Only editors and admins can delete
    if (access.role === "viewer") {
      return NextResponse.json({ error: "You do not have permission to delete transactions" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing required query parameter: id" }, { status: 400 });
    }

    // Verify transaction belongs to this company
    const txn = await prisma.transaction.findFirst({
      where: { id, companyId: params.companyId },
    });

    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Create entry log before deletion
    await createEntryLog({
      companyId: params.companyId,
      module: txn.type === "income" ? "income" : "expense",
      entryId: id,
      action: "deleted",
      performedBy: session.user.id,
      performedByName: session.user.name || "",
    });

    // Perform hard delete
    await prisma.transaction.delete({
      where: { id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId: params.companyId,
        action: "delete",
        entityType: "transaction",
        entityId: id,
        oldValues: JSON.stringify(txn),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
