import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns the list of conversation targets for the current user:
// - All other users (DMs)
// - All channels (companies the user has access to)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // All users excluding self
    const users = await prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    // Channels = companies user has access to (super_admin sees all)
    const isSuperAdmin = (session.user as any).role === "super_admin";
    const companies = await prisma.company.findMany({
      where: isSuperAdmin
        ? {}
        : { users: { some: { userId } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      users,
      channels: companies,
    });
  } catch (error) {
    console.error("GET /api/chat/conversations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
