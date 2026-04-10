import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function cuid() {
  return "ps" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list all payroll settings for a company
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
    const settingType = url.searchParams.get("type"); // salary_deduction, salary_bonus, daily_cash_category

    let where = `company_id = '${params.companyId}'`;
    if (settingType) where += ` AND setting_type = '${settingType}'`;

    const settings: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payroll_settings WHERE ${where} AND is_active = 1 ORDER BY sort_order ASC, field_label ASC`
    );

    return NextResponse.json({
      settings: settings.map((s: any) => ({
        id: s.id,
        settingType: s.setting_type,
        fieldName: s.field_name,
        fieldLabel: s.field_label,
        fieldType: s.field_type,
        defaultValue: s.default_value,
        isActive: s.is_active === 1,
        sortOrder: s.sort_order,
      })),
    });
  } catch (error) {
    console.error("GET /payroll-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new payroll setting field
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
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { settingType, fieldName, fieldLabel, fieldType, defaultValue, sortOrder } = body;

    if (!settingType || !fieldName || !fieldLabel) {
      return NextResponse.json({ error: "settingType, fieldName, fieldLabel are required" }, { status: 400 });
    }

    const id = cuid();
    const now = new Date().toISOString();
    const name = fieldName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    await prisma.$executeRawUnsafe(
      `INSERT INTO payroll_settings (id, company_id, setting_type, field_name, field_label, field_type, default_value, is_active, sort_order, created_at)
       VALUES ('${id}', '${params.companyId}', '${settingType}', '${name}', '${fieldLabel.replace(/'/g, "''")}', '${fieldType || "number"}', '${defaultValue || ""}', 1, ${sortOrder || 0}, '${now}')`
    );

    return NextResponse.json({ id, fieldName: name, fieldLabel }, { status: 201 });
  } catch (error) {
    console.error("POST /payroll-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — deactivate a payroll setting
export async function DELETE(
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
    const settingId = url.searchParams.get("id");
    if (!settingId) {
      return NextResponse.json({ error: "Setting ID required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE payroll_settings SET is_active = 0 WHERE id = '${settingId}' AND company_id = '${params.companyId}'`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /payroll-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
