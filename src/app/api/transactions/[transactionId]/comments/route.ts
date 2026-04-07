import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function cuid() {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}

async function userCanAccessTransaction(
  userId: string,
  transactionId: string,
  role?: string
): Promise<{ ok: boolean; companyId?: string }> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { companyId: true },
  });
  if (!txn) return { ok: false };
  if (role === "super_admin") return { ok: true, companyId: txn.companyId };
  const link = await prisma.companyUser.findFirst({
    where: { userId, companyId: txn.companyId },
    select: { id: true },
  });
  return { ok: !!link, companyId: txn.companyId };
}

// GET comments for a transaction
export async function GET(
  _request: Request,
  { params }: { params: { transactionId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await userCanAccessTransaction(
      session.user.id,
      params.transactionId,
      (session.user as any).role
    );
    if (!access.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT c.id, c.transaction_id as transactionId, c.user_id as userId,
              c.content, c.created_at as createdAt,
              u.name as userName
       FROM transaction_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.transaction_id = ?
       ORDER BY c.created_at ASC`,
      params.transactionId
    );

    return NextResponse.json({ comments: rows });
  } catch (error) {
    console.error("GET comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST a new comment
export async function POST(
  request: Request,
  { params }: { params: { transactionId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await userCanAccessTransaction(
      session.user.id,
      params.transactionId,
      (session.user as any).role
    );
    if (!access.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    const id = cuid();
    await prisma.$executeRawUnsafe(
      `INSERT INTO transaction_comments (id, transaction_id, user_id, content, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      id,
      params.transactionId,
      session.user.id,
      content
    );

    return NextResponse.json(
      {
        id,
        transactionId: params.transactionId,
        userId: session.user.id,
        userName: session.user.name,
        content,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
