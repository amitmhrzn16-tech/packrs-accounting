import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function cuid() {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}

// GET messages between current user and :userId
export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = session.user.id;
    const other = params.userId;

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT m.id, m.sender_id as senderId, m.recipient_id as recipientId,
              m.content, m.created_at as createdAt,
              u.name as senderName
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.created_at ASC
       LIMIT 200`,
      me,
      other,
      other,
      me
    );

    return NextResponse.json({ messages: rows });
  } catch (error) {
    console.error("GET /api/chat/dm error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST a new DM message
export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });
    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    const id = cuid();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chat_messages (id, sender_id, recipient_id, company_id, content, created_at)
       VALUES (?, ?, ?, NULL, ?, datetime('now'))`,
      id,
      session.user.id,
      params.userId,
      content
    );

    return NextResponse.json({ id, content, senderId: session.user.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chat/dm error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
