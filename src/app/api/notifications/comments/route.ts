import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET ?since=<ISO>  Returns recent transaction comments from OTHER users
// on transactions in companies the current user has access to.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = (session.user as any).role;
    const url = new URL(request.url);
    const since = url.searchParams.get("since") || "";

    // Accessible company IDs
    let companyIds: string[] = [];
    if (role === "super_admin") {
      const all = await prisma.company.findMany({ select: { id: true } });
      companyIds = all.map((c) => c.id);
    } else {
      const links = await prisma.companyUser.findMany({
        where: { userId },
        select: { companyId: true },
      });
      companyIds = links.map((l) => l.companyId);
    }

    if (companyIds.length === 0) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const sinceClause = since ? `AND c.created_at > ?` : "";
    const placeholders = companyIds.map(() => "?").join(",");
    const paramsArr: any[] = [userId, ...companyIds];
    if (since) paramsArr.push(since);

    const sql = `
      SELECT c.id, c.transaction_id as transactionId, c.user_id as userId,
             c.content, c.created_at as createdAt,
             u.name as userName,
             t.type as txnType, t.amount, t.particulars, t.date as txnDate,
             t.company_id as companyId,
             co.name as companyName
      FROM transaction_comments c
      JOIN users u ON u.id = c.user_id
      JOIN transactions t ON t.id = c.transaction_id
      JOIN companies co ON co.id = t.company_id
      WHERE c.user_id != ?
        AND t.company_id IN (${placeholders})
        ${sinceClause}
      ORDER BY c.created_at DESC
      LIMIT 30
    `;

    const rows: any[] = await prisma.$queryRawUnsafe(sql, ...paramsArr);

    return NextResponse.json({
      notifications: rows,
      unreadCount: rows.length,
    });
  } catch (error) {
    console.error("GET /api/notifications/comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
