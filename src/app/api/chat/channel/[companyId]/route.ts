import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function cuid() {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}

async function userHasCompanyAccess(userId: string, companyId: string, role?: string) {
  if (role === "super_admin") return true;
  const link = await prisma.companyUser.findFirst({
    where: { userId, companyId },
    select: { id: true },
  });
  return !!link;
}

// GET channel messages for a company
export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await userHasCompanyAccess(
      session.user.id,
      params.companyId,
      (session.user as any).role
    );
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT m.id, m.sender_id as senderId, m.company_id as companyId,
              m.content, m.created_at as createdAt,
              u.name as senderName
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.company_id = ?
       ORDER BY m.created_at ASC
       LIMIT 200`,
      params.companyId
    );

    return NextResponse.json({ messages: rows });
  } catch (error) {
    console.error("GET /api/chat/channel error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST a channel message
export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await userHasCompanyAccess(
      session.user.id,
      params.companyId,
      (session.user as any).role
    );
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    const id = cuid();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chat_messages (id, sender_id, recipient_id, company_id, content, created_at)
       VALUES (?, ?, NULL, ?, ?, datetime('now'))`,
      id,
      session.user.id,
      params.companyId,
      content
    );

    return NextResponse.json(
      { id, content, senderId: session.user.id, companyId: params.companyId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/chat/channel error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
