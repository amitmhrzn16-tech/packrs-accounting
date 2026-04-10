import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { notifySlack } from "@/lib/slack";

function cuid() {
  return "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list all staff for a company
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
    const role = url.searchParams.get("role");
    const isActive = url.searchParams.get("isActive");
    const search = url.searchParams.get("search");

    let where = `company_id = '${params.companyId}'`;
    if (role) where += ` AND role = '${role}'`;
    if (isActive === "true") where += ` AND is_active = 1`;
    if (isActive === "false") where += ` AND is_active = 0`;
    if (search) where += ` AND (name LIKE '%${search}%' OR phone LIKE '%${search}%' OR email LIKE '%${search}%')`;

    const staff: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM staff WHERE ${where} ORDER BY name ASC`
    );

    // For each staff member, get advance due totals
    const staffWithDues = await Promise.all(
      staff.map(async (s: any) => {
        const advDue: any[] = await prisma.$queryRawUnsafe(
          `SELECT COALESCE(SUM(due_amount), 0) as total_due FROM advance_payments WHERE staff_id = '${s.id}' AND status != 'recovered'`
        );
        return {
          ...s,
          isActive: s.is_active === 1,
          salaryAmount: s.salary_amount,
          joinDate: s.join_date,
          bankAccount: s.bank_account,
          bankName: s.bank_name,
          emergencyContact: s.emergency_contact,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          totalAdvanceDue: advDue[0]?.total_due || 0,
        };
      })
    );

    return NextResponse.json({ staff: staffWithDues });
  } catch (error) {
    console.error("GET /staff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new staff member
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
    const { name, phone, email, role, designation, salaryAmount, joinDate, bankAccount, bankName, emergencyContact, address, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const id = cuid();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO staff (id, company_id, name, phone, email, role, designation, salary_amount, join_date, is_active, bank_account, bank_name, emergency_contact, address, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      id, params.companyId, name, phone || null, email || null,
      role || "rider", designation || null, salaryAmount || 0, joinDate || null,
      bankAccount || null, bankName || null, emergencyContact || null, address || null, notes || null,
      now, now
    );

    // Slack notification
    const roleLabel = role || "rider";
    const emoji = roleLabel === "rider" ? "🏍️" : "👤";
    notifySlack(
      params.companyId,
      `${emoji} New ${roleLabel} added: *${name}*${salaryAmount ? ` | Monthly salary: ${salaryAmount}` : ""}`
    ).catch(() => {});

    return NextResponse.json({ id, name, role: roleLabel }, { status: 201 });
  } catch (error) {
    console.error("POST /staff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — update a staff member
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
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, phone, email, role, designation, salaryAmount, joinDate, isActive, bankAccount, bankName, emergencyContact, address, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Staff ID is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE staff SET name = ?, phone = ?, email = ?, role = ?, designation = ?, salary_amount = ?, join_date = ?, is_active = ?, bank_account = ?, bank_name = ?, emergency_contact = ?, address = ?, notes = ?, updated_at = ?
       WHERE id = ? AND company_id = ?`,
      name, phone || null, email || null, role || "rider", designation || null,
      salaryAmount || 0, joinDate || null, isActive !== false ? 1 : 0,
      bankAccount || null, bankName || null, emergencyContact || null, address || null, notes || null,
      now, id, params.companyId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /staff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — deactivate a staff member
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
    const staffId = url.searchParams.get("id");
    if (!staffId) {
      return NextResponse.json({ error: "Staff ID required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE staff SET is_active = 0, updated_at = ? WHERE id = ? AND company_id = ?`,
      new Date().toISOString(), staffId, params.companyId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /staff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
