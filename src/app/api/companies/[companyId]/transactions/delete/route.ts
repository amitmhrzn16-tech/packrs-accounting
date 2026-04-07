import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({
    where: { userId, companyId },
  });
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

    // Viewers cannot delete entries
    if (access.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot delete entries" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required query parameter: id" },
        { status: 400 }
      );
    }

    // Verify the transaction belongs to this company
    const transaction = await prisma.transaction.findFirst({
      where: { id, companyId: params.companyId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found or does not belong to this company" },
        { status: 404 }
      );
    }

    // Delete the transaction
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
        oldValues: JSON.stringify(transaction),
      },
    });

    return NextResponse.json(
      { message: "Transaction deleted successfully", deletedCount: 1 },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /transactions/delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

    // Viewers cannot delete entries
    if (access.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot delete entries" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid required field: ids (must be a non-empty array)" },
        { status: 400 }
      );
    }

    // Verify all transactions belong to this company
    const transactions = await prisma.transaction.findMany({
      where: {
        id: { in: ids },
        companyId: params.companyId,
      },
    });

    if (transactions.length !== ids.length) {
      return NextResponse.json(
        {
          error: "One or more transaction IDs do not exist or do not belong to this company",
        },
        { status: 400 }
      );
    }

    // Use a transaction to delete all at once and create audit logs
    const result = await prisma.$transaction(async (tx) => {
      // Delete all transactions
      const deleteResult = await tx.transaction.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      // Create audit logs for each deletion
      await Promise.all(
        transactions.map((transaction) =>
          tx.auditLog.create({
            data: {
              userId: session.user.id,
              companyId: params.companyId,
              action: "delete",
              entityType: "transaction",
              entityId: transaction.id,
              oldValues: JSON.stringify(transaction),
            },
          })
        )
      );

      return deleteResult;
    });

    return NextResponse.json(
      {
        message: "Transactions deleted successfully",
        deletedCount: result.count,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /transactions/delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
