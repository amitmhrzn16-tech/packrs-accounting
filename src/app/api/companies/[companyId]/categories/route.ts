import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to company
    const companyUser = await prisma.companyUser.findFirst({
      where: { userId: session.user.id, companyId: params.companyId },
    });

    if (!companyUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const type = url.searchParams.get("type"); // income | expense

    // Build where clause
    interface WhereClause {
      companyId: string;
      type?: string;
    }

    const where: WhereClause = {
      companyId: params.companyId,
    };

    if (type) {
      where.type = type;
    }

    // Get categories with children
    const categories = await prisma.category.findMany({
      where,
      include: {
        children: {
          include: {
            children: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET /categories error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to company
    const companyUser = await prisma.companyUser.findFirst({
      where: { userId: session.user.id, companyId: params.companyId },
    });

    if (!companyUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { name, type, parentId } = body;

    // Validate required fields
    if (!name || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name, type" },
        { status: 400 }
      );
    }

    if (!["income", "expense"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'income' or 'expense'" },
        { status: 400 }
      );
    }

    // If parentId provided, verify it belongs to the same company and type
    if (parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: parentId },
      });

      if (!parentCategory || parentCategory.companyId !== params.companyId) {
        return NextResponse.json(
          { error: "Invalid parentId" },
          { status: 400 }
        );
      }

      if (parentCategory.type !== type) {
        return NextResponse.json(
          { error: "Parent category must be of the same type" },
          { status: 400 }
        );
      }
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        name,
        type,
        parentId,
        companyId: params.companyId,
      },
      include: {
        children: {
          include: {
            children: true,
          },
        },
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("POST /categories error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
