import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can view any user's companies
    // Users can view their own companies
    if (session.user.role !== "super_admin" && session.user.id !== params.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's companies
    const companies = await prisma.companyUser.findMany({
      where: { userId: params.userId },
      select: {
        companyId: true,
        role: true,
        company: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
      },
      orderBy: { company: { name: "asc" } },
    });

    const formattedCompanies = companies.map((cu) => ({
      companyId: cu.companyId,
      companyName: cu.company.name,
      currency: cu.company.currency,
      role: cu.role,
    }));

    return NextResponse.json(formattedCompanies);
  } catch (error) {
    console.error("GET /users/[userId]/companies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can add users to companies
    if (session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { companyId, role } = body;

    // Validate required fields
    if (!companyId || !role) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, role" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["company_admin", "accountant", "viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be one of: company_admin, accountant, viewer" },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Check if user already has access to company
    const existingAccess = await prisma.companyUser.findFirst({
      where: {
        userId: params.userId,
        companyId,
      },
    });

    if (existingAccess) {
      return NextResponse.json(
        { error: "User already has access to this company" },
        { status: 400 }
      );
    }

    // Create CompanyUser entry
    const companyUser = await prisma.companyUser.create({
      data: {
        userId: params.userId,
        companyId,
        role,
      },
      select: {
        companyId: true,
        role: true,
        company: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId,
        action: "create",
        entityType: "companyUser",
        entityId: companyUser.companyId,
        newValues: JSON.stringify({
          userId: params.userId,
          companyId,
          role,
        }),
      },
    });

    return NextResponse.json(
      {
        companyId: companyUser.companyId,
        companyName: companyUser.company.name,
        currency: companyUser.company.currency,
        role: companyUser.role,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /users/[userId]/companies error:", error);
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

    // Only super_admin can remove users from companies
    if (session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get companyId from query params
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "Missing required query parameter: companyId" },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find and delete CompanyUser entry
    const companyUser = await prisma.companyUser.findFirst({
      where: {
        userId: params.userId,
        companyId,
      },
    });

    if (!companyUser) {
      return NextResponse.json(
        { error: "User does not have access to this company" },
        { status: 404 }
      );
    }

    await prisma.companyUser.delete({
      where: {
        id: companyUser.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId,
        action: "delete",
        entityType: "companyUser",
        entityId: companyId,
        oldValues: JSON.stringify({
          userId: params.userId,
          companyId,
          role: companyUser.role,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /users/[userId]/companies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
