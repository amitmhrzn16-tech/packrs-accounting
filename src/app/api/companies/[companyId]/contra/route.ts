import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createEntryLog } from "@/lib/entry-log";

function cuid() {
  return "ct" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — list contra entries for the company
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

    const contraEntries: any[] = await prisma.$queryRawUnsafe(
      `SELECT ce.*, u.name as created_by_name, u2.name as approved_by_name
       FROM contra_entries ce
       LEFT JOIN users u ON u.id = ce.created_by
       LEFT JOIN users u2 ON u2.id = ce.approved_by
       WHERE ce.company_id = ?
       ORDER BY ce.entry_date DESC`,
      params.companyId
    );

    const formatted = contraEntries.map((c: any) => ({
      id: c.id,
      fromAccount: c.from_account,
      toAccount: c.to_account,
      amount: Number(c.amount),
      entryDate: c.entry_date,
      referenceNo: c.reference_no || "",
      description: c.description || "",
      approvalStatus: c.approval_status || "pending",
      approvedBy: c.approved_by || null,
      approvedByName: c.approved_by_name || null,
      approvedAt: c.approved_at || null,
      createdBy: c.created_by,
      createdByName: c.created_by_name || "System",
      createdAt: c.created_at,
    }));

    // Calculate summary: net movement per account
    const summary: any[] = await prisma.$queryRawUnsafe(
      `SELECT from_account as account, -SUM(amount) as net_movement
       FROM contra_entries
       WHERE company_id = ? AND approval_status = 'approved'
       GROUP BY from_account
       UNION ALL
       SELECT to_account as account, SUM(amount) as net_movement
       FROM contra_entries
       WHERE company_id = ? AND approval_status = 'approved'
       GROUP BY to_account`,
      params.companyId,
      params.companyId
    );

    // Aggregate by account
    const summaryByAccount: Record<string, number> = {};
    summary.forEach((s: any) => {
      const account = s.account;
      const movement = Number(s.net_movement || 0);
      summaryByAccount[account] = (summaryByAccount[account] || 0) + movement;
    });

    return NextResponse.json({
      contraEntries: formatted,
      summary: summaryByAccount,
    });
  } catch (error) {
    console.error("GET /contra error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create contra entry
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
    const { fromAccount, toAccount, amount, entryDate, referenceNo, description } = body;

    // Validation
    if (!fromAccount || !toAccount || !amount || !entryDate) {
      return NextResponse.json(
        { error: "fromAccount, toAccount, amount, entryDate are required" },
        { status: 400 }
      );
    }

    if (fromAccount === toAccount) {
      return NextResponse.json(
        { error: "fromAccount and toAccount must be different" },
        { status: 400 }
      );
    }

    const id = cuid();
    const now = new Date().toISOString();
    const refNo = (referenceNo || "").replace(/'/g, "''");
    const desc = (description || "").replace(/'/g, "''");

    // Insert contra entry
    await prisma.$executeRawUnsafe(
      `INSERT INTO contra_entries
        (id, company_id, from_account, to_account, amount, entry_date, reference_no, description, approval_status, created_by, created_at, updated_at)
       VALUES
        ('${id}', '${params.companyId}', '${fromAccount}', '${toAccount}', ${Number(amount)}, '${entryDate}', '${refNo}', '${desc}', 'pending', '${session.user.id}', '${now}', '${now}')`
    );

    // Verify insert
    const verify: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM contra_entries WHERE id = ?`,
      id
    );
    if (!verify.length) {
      return NextResponse.json(
        { error: "Failed to create contra entry — database insert failed" },
        { status: 500 }
      );
    }

    // Create entry log
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: "contra",
        entryId: id,
        action: "created",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
      });
    } catch (logErr) {
      console.error("Failed to create entry log:", logErr);
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("POST /contra error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// PUT — handle actions: edit, approve, reject
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
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action are required" },
        { status: 400 }
      );
    }

    // Verify the contra entry belongs to this company
    const contraEntry: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM contra_entries WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );
    if (!contraEntry.length) {
      return NextResponse.json({ error: "Contra entry not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "edit") {
      const { fromAccount, toAccount, amount, entryDate, referenceNo, description } = body;

      if (fromAccount === toAccount) {
        return NextResponse.json(
          { error: "fromAccount and toAccount must be different" },
          { status: 400 }
        );
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (fromAccount !== undefined) {
        updates.push("from_account = ?");
        values.push(fromAccount);
      }
      if (toAccount !== undefined) {
        updates.push("to_account = ?");
        values.push(toAccount);
      }
      if (amount !== undefined) {
        updates.push("amount = ?");
        values.push(Number(amount));
      }
      if (entryDate !== undefined) {
        updates.push("entry_date = ?");
        values.push(entryDate);
      }
      if (referenceNo !== undefined) {
        updates.push("reference_no = ?");
        values.push(referenceNo || "");
      }
      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description || "");
      }

      if (updates.length > 0) {
        updates.push("updated_at = ?");
        values.push(now);
        values.push(id);

        const updateClause = updates.join(", ");
        await prisma.$executeRawUnsafe(
          `UPDATE contra_entries SET ${updateClause} WHERE id = ?`,
          ...values
        );
      }

      // Create entry log
      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "contra",
          entryId: id,
          action: "edited",
          performedBy: session.user.id,
          performedByName: session.user.name || "",
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id });
    } else if (action === "approve") {
      await prisma.$executeRawUnsafe(
        `UPDATE contra_entries SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
        "approved",
        session.user.id,
        now,
        now,
        id
      );

      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "contra",
          entryId: id,
          action: "approved",
          performedBy: session.user.id,
          performedByName: session.user.name || "",
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id, approvalStatus: "approved" });
    } else if (action === "reject") {
      await prisma.$executeRawUnsafe(
        `UPDATE contra_entries SET approval_status = ?, updated_at = ? WHERE id = ?`,
        "rejected",
        now,
        id
      );

      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "contra",
          entryId: id,
          action: "rejected",
          performedBy: session.user.id,
          performedByName: session.user.name || "",
        });
      } catch (logErr) {
        console.error("Failed to create entry log:", logErr);
      }

      return NextResponse.json({ success: true, id, approvalStatus: "rejected" });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'edit', 'approve', or 'reject'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("PUT /contra error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// DELETE — delete by ?id=xxx
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
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify the contra entry belongs to this company
    const contraEntry: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM contra_entries WHERE id = ? AND company_id = ?`,
      id,
      params.companyId
    );
    if (!contraEntry.length) {
      return NextResponse.json({ error: "Contra entry not found" }, { status: 404 });
    }

    // Delete the contra entry
    await prisma.$executeRawUnsafe(
      `DELETE FROM contra_entries WHERE id = ?`,
      id
    );

    // Create entry log
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: "contra",
        entryId: id,
        action: "deleted",
        performedBy: session.user.id,
        performedByName: session.user.name || "",
      });
    } catch (logErr) {
      console.error("Failed to create entry log:", logErr);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /contra error:", error);
    return NextResponse.json({
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
