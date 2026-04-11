import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function cuid() {
  return "mp" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

const ALL_MODULES = [
  "income",
  "expense",
  "daily_cash",
  "salary",
  "advance",
  "intercompany",
  "contra",
  "reconciliation",
  "settings",
  "staff",
];

// GET — list all permissions for company
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

    // Get all users for this company
    const companyUsers: any[] = await prisma.$queryRawUnsafe(
      `SELECT cu.user_id, cu.role as company_role, u.name, u.email, u.role as system_role
       FROM company_users cu
       JOIN users u ON u.id = cu.user_id
       WHERE cu.company_id = ?
       ORDER BY u.name ASC`,
      params.companyId
    );

    // Get all permissions
    const permissions: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM module_permissions WHERE company_id = ?`,
      params.companyId
    );

    // Build a map: userId -> module -> permissions
    const permMap: Record<string, Record<string, any>> = {};
    for (const p of permissions) {
      if (!permMap[p.user_id]) permMap[p.user_id] = {};
      permMap[p.user_id][p.module] = {
        id: p.id,
        canView: Number(p.can_view) === 1,
        canAdd: Number(p.can_add) === 1,
        canEdit: Number(p.can_edit) === 1,
        canDelete: Number(p.can_delete) === 1,
        canComment: Number(p.can_comment) === 1,
        canApprove: Number(p.can_approve) === 1,
      };
    }

    return NextResponse.json({
      users: companyUsers.map((u: any) => ({
        id: u.user_id,
        name: u.name,
        email: u.email,
        companyRole: u.company_role,
        systemRole: u.system_role,
      })),
      permissions: permMap,
      modules: ALL_MODULES,
    });
  } catch (error) {
    console.error("GET /permissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — set permissions for a user on all modules (bulk upsert)
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
    if (!access || (access.role !== "company_admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Only admins can manage permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, permissions } = body;
    // permissions: { module: { canView, canAdd, canEdit, canDelete, canComment, canApprove } }

    if (!userId || !permissions) {
      return NextResponse.json({ error: "userId and permissions are required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    for (const [module, perms] of Object.entries(permissions) as [string, any][]) {
      if (!ALL_MODULES.includes(module)) continue;

      // Check if permission record exists
      const existing: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM module_permissions WHERE company_id = ? AND user_id = ? AND module = ?`,
        params.companyId,
        userId,
        module
      );

      if (existing.length > 0) {
        // Update
        await prisma.$executeRawUnsafe(
          `UPDATE module_permissions SET
            can_view = ${perms.canView ? 1 : 0},
            can_add = ${perms.canAdd ? 1 : 0},
            can_edit = ${perms.canEdit ? 1 : 0},
            can_delete = ${perms.canDelete ? 1 : 0},
            can_comment = ${perms.canComment ? 1 : 0},
            can_approve = ${perms.canApprove ? 1 : 0},
            updated_at = '${now}'
           WHERE id = '${existing[0].id}'`
        );
      } else {
        // Insert
        const id = cuid();
        await prisma.$executeRawUnsafe(
          `INSERT INTO module_permissions (id, company_id, user_id, module, can_view, can_add, can_edit, can_delete, can_comment, can_approve, created_at, updated_at)
           VALUES ('${id}', '${params.companyId}', '${userId}', '${module}', ${perms.canView ? 1 : 0}, ${perms.canAdd ? 1 : 0}, ${perms.canEdit ? 1 : 0}, ${perms.canDelete ? 1 : 0}, ${perms.canComment ? 1 : 0}, ${perms.canApprove ? 1 : 0}, '${now}', '${now}')`
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /permissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — apply a role preset to a user (e.g., "admin gets all", "viewer gets view only")
export async function PUT(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await verifyAccess(session.user.id, params.companyId);
    if (!access || (access.role !== "company_admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Only admins can manage permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, preset } = body;
    // preset: "super_admin" | "admin" | "accountant" | "viewer"

    const presets: Record<string, any> = {
      super_admin: { canView: true, canAdd: true, canEdit: true, canDelete: true, canComment: true, canApprove: true },
      admin: { canView: true, canAdd: true, canEdit: true, canDelete: true, canComment: true, canApprove: true },
      accountant: { canView: true, canAdd: true, canEdit: true, canDelete: false, canComment: true, canApprove: false },
      viewer: { canView: true, canAdd: false, canEdit: false, canDelete: false, canComment: true, canApprove: false },
    };

    const perms = presets[preset] || presets.viewer;
    const now = new Date().toISOString();

    // Delete existing and insert fresh for all modules
    await prisma.$executeRawUnsafe(
      `DELETE FROM module_permissions WHERE company_id = ? AND user_id = ?`,
      params.companyId,
      userId
    );

    for (const module of ALL_MODULES) {
      const id = cuid();
      await prisma.$executeRawUnsafe(
        `INSERT INTO module_permissions (id, company_id, user_id, module, can_view, can_add, can_edit, can_delete, can_comment, can_approve, created_at, updated_at)
         VALUES ('${id}', '${params.companyId}', '${userId}', '${module}', ${perms.canView ? 1 : 0}, ${perms.canAdd ? 1 : 0}, ${perms.canEdit ? 1 : 0}, ${perms.canDelete ? 1 : 0}, ${perms.canComment ? 1 : 0}, ${perms.canApprove ? 1 : 0}, '${now}', '${now}')`
      );
    }

    return NextResponse.json({ success: true, preset, modulesUpdated: ALL_MODULES.length });
  } catch (error) {
    console.error("PUT /permissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
