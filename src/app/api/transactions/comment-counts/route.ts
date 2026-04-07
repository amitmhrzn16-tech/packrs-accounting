import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST { transactionIds: string[] } → { counts: Record<string, number> }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ids: string[] = Array.isArray(body?.transactionIds) ? body.transactionIds : [];
    if (ids.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const placeholders = ids.map(() => "?").join(",");
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT transaction_id as id, COUNT(*) as cnt
       FROM transaction_comments
       WHERE transaction_id IN (${placeholders})
       GROUP BY transaction_id`,
      ...ids
    );

    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.id] = Number(r.cnt) || 0;
    }
    return NextResponse.json({ counts });
  } catch (error) {
    console.error("POST comment-counts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
