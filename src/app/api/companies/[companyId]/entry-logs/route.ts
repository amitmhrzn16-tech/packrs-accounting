import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEntryLogs, getCompanyLogs, type LogModule } from "@/lib/entry-log";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
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
    const module = url.searchParams.get("module") as LogModule | null;
    const entryId = url.searchParams.get("entryId");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    if (module && entryId) {
      // Get logs for a specific entry
      const logs = await getEntryLogs(module, entryId);
      return NextResponse.json({ logs });
    }

    // Get all logs for company
    const logs = await getCompanyLogs(params.companyId, limit, offset);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("GET /entry-logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
