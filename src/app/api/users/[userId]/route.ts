import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can view users
    if (session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        companies: {
          select: {
            companyId: true,
            role: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Transform response to include companyName
    return NextResponse.json({
      ...user,
      companies: user.companies.map((cu) => ({
        companyId: cu.companyId,
        companyName: cu.company.name,
        role: cu.role,
      })),
    });
  } catch (error) {
    console.error("GET /users/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can update users
    if (session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, role, password } = body;

    // Get old user data for audit log
    const oldUser = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!oldUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) {
      const validRoles = ["super_admin", "company_admin", "accountant", "viewer"];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: "Invalid role. Must be one of: super_admin, company_admin, accountant, viewer" },
          { status: 400 }
        );
      }
      updateData.role = role;
    }
    if (password) {
      updateData.passwordHash = await hash(password, 10);
    }

    // Check email uniqueness if being changed
    if (email && email !== oldUser.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return NextResponse.json({ error: "Email already exists" }, { status: 400 });
      }
      updateData.email = email;
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: params.userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "update",
        entityType: "user",
        entityId: user.id,
        oldValues: JSON.stringify({
          name: oldUser.name,
          email: oldUser.email,
          role: oldUser.role,
        }),
        newValues: JSON.stringify({
          name: user.name,
          email: user.email,
          role: user.role,
        }),
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("PUT /users/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can delete users
    if (session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent deleting yourself
    if (session.user.id === params.userId) {
      return NextResponse.json(
        { error: "Cannot delete your own user account" },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user (cascades to CompanyUser, AuditLog, etc.)
    await prisma.user.delete({
      where: { id: params.userId },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "delete",
        entityType: "user",
        entityId: params.userId,
        oldValues: JSON.stringify({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /users/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
