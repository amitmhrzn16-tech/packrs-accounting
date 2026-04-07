import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { runDmsSync } from "@/lib/dms/dms-sync";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * POST /api/companies/[companyId]/dms-sync/run
 * Trigger a manual DMS sync
 *
 * Body: { fromDate?: string, toDate?: string }
 */
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
    if (!access || access.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { fromDate, toDate } = body as {
      fromDate?: string;
      toDate?: string;
    };

    const result = await runDmsSync(
      params.companyId,
      "manual",
      fromDate,
      toDate,
      session.user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("DMS sync run error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run DMS sync" },
      { status: 500 }
    );
  }
}
