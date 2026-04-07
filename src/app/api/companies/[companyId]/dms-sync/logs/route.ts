import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getConfigByCompany, getSyncLogs } from "@/lib/dms/dms-db";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * GET /api/companies/[companyId]/dms-sync/logs
 */
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
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const config = await getConfigByCompany(params.companyId);
    if (!config) {
      return NextResponse.json({ logs: [], total: 0 });
    }

    const { logs, total } = await getSyncLogs(config.id, limit, offset);

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        syncType: log.sync_type,
        status: log.status,
        syncDate: log.sync_date,
        incomeCount: log.income_count,
        expenseCount: log.expense_count,
        matchedCount: log.matched_count,
        newCount: log.new_count,
        errorMessage: log.error_message,
        startedAt: log.started_at,
        completedAt: log.completed_at,
      })),
      total,
    });
  } catch (error: any) {
    console.error("DMS sync logs error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get sync logs" },
      { status: 500 }
    );
  }
}
