import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getConfigByCompany, upsertConfig } from "@/lib/dms/dms-db";

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * GET /api/companies/[companyId]/dms-sync/config
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

    const config = await getConfigByCompany(params.companyId);

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json({
      configured: true,
      id: config.id,
      dmsBaseUrl: config.dms_base_url,
      dmsUsername: config.dms_username,
      hasPassword: !!config.dms_password,
      branchId: config.branch_id,
      branchName: config.branch_name,
      syncEnabled: config.sync_enabled === 1,
      syncFrequency: config.sync_frequency,
      lastSyncAt: config.last_sync_at,
    });
  } catch (error: any) {
    console.error("DMS config GET error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get DMS config" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[companyId]/dms-sync/config
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

    const body = await request.json();
    const {
      dmsBaseUrl,
      dmsUsername,
      dmsPassword,
      branchId,
      branchName,
      syncEnabled,
      syncFrequency,
    } = body;

    if (!dmsBaseUrl || !dmsUsername) {
      return NextResponse.json(
        { error: "DMS base URL and username are required" },
        { status: 400 }
      );
    }

    const config = await upsertConfig(params.companyId, {
      dmsBaseUrl,
      dmsUsername,
      dmsPassword,
      branchId,
      branchName,
      syncEnabled,
      syncFrequency,
    });

    return NextResponse.json({
      success: true,
      id: config.id,
      message: "DMS config saved successfully",
    });
  } catch (error: any) {
    console.error("DMS config POST error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save DMS config" },
      { status: 500 }
    );
  }
}
