import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createEntryLog } from "@/lib/entry-log";

function cuid() {
  return "ic" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

// GET — List all intercompany transfers where this company is sender or receiver
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

    // Fetch transfers where this company is sender or receiver
    const transfers: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         ic.id, ic.from_company_id, ic.to_company_id, ic.amount, ic.transfer_date,
         ic.payment_method, ic.reference_no, ic.description, ic.transfer_type,
         ic.status, ic.approval_status, ic.approved_by, ic.approved_at, ic.attachment_url,
         ic.created_by, ic.created_at,
         c1.name as from_company_name, c2.name as to_company_name,
         u.name as created_by_name, u2.name as approved_by_name
       FROM intercompany_transfers ic
       LEFT JOIN companies c1 ON c1.id = ic.from_company_id
       LEFT JOIN companies c2 ON c2.id = ic.to_company_id
       LEFT JOIN users u ON u.id = ic.created_by
       LEFT JOIN users u2 ON u2.id = ic.approved_by
       WHERE ic.from_company_id = ? OR ic.to_company_id = ?
       ORDER BY ic.created_at DESC`,
      params.companyId,
      params.companyId
    );

    // Get loan accounts for this company
    const loanAccounts: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         id, counterparty_id, counterparty_name, account_type, principal_amount,
         interest_rate, interest_accrued, amount_paid, balance, start_date, due_date, status, notes
       FROM loan_accounts
       WHERE company_id = ?
       ORDER BY start_date DESC`,
      params.companyId
    );

    const formattedTransfers = transfers.map((t: any) => ({
      id: t.id,
      fromCompanyId: t.from_company_id,
      fromCompanyName: t.from_company_name || "Unknown",
      toCompanyId: t.to_company_id,
      toCompanyName: t.to_company_name || "Unknown",
      amount: Number(t.amount),
      transferDate: t.transfer_date,
      paymentMethod: t.payment_method,
      referenceNo: t.reference_no,
      description: t.description,
      transferType: t.transfer_type,
      status: t.status,
      approvalStatus: t.approval_status,
      approvedBy: t.approved_by,
      approvedByName: t.approved_by_name,
      approvedAt: t.approved_at,
      attachmentUrl: t.attachment_url,
      createdBy: t.created_by,
      createdByName: t.created_by_name,
      createdAt: t.created_at,
    }));

    const formattedLoanAccounts = loanAccounts.map((l: any) => ({
      id: l.id,
      counterpartyId: l.counterparty_id,
      counterpartyName: l.counterparty_name,
      accountType: l.account_type,
      principalAmount: Number(l.principal_amount),
      interestRate: Number(l.interest_rate),
      interestAccrued: Number(l.interest_accrued),
      amountPaid: Number(l.amount_paid),
      balance: Number(l.balance),
      startDate: l.start_date,
      dueDate: l.due_date,
      status: l.status,
      notes: l.notes,
    }));

    // Summary
    const summary: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COALESCE(SUM(CASE WHEN from_company_id = ? THEN amount ELSE 0 END), 0) as total_sent,
         COALESCE(SUM(CASE WHEN to_company_id = ? THEN amount ELSE 0 END), 0) as total_received
       FROM intercompany_transfers
       WHERE (from_company_id = ? OR to_company_id = ?)`,
      params.companyId,
      params.companyId,
      params.companyId,
      params.companyId
    );

    const safeSummary = {
      totalSent: Number(summary[0]?.total_sent || 0),
      totalReceived: Number(summary[0]?.total_received || 0),
      netPosition: Number(summary[0]?.total_received || 0) - Number(summary[0]?.total_sent || 0),
    };

    return NextResponse.json({
      transfers: formattedTransfers,
      loanAccounts: formattedLoanAccounts,
      summary: safeSummary,
    });
  } catch (error) {
    console.error("GET /intercompany error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — Create a new intercompany transfer
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
    const { toCompanyId, amount, transferDate, paymentMethod, referenceNo, description, transferType, attachmentUrl } = body;

    if (!toCompanyId || !amount || !transferDate) {
      return NextResponse.json(
        { error: "toCompanyId, amount, transferDate are required" },
        { status: 400 }
      );
    }

    // Verify toCompany exists
    const toCompany: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM companies WHERE id = ?`,
      toCompanyId
    );
    if (!toCompany.length) {
      return NextResponse.json({ error: "Recipient company not found" }, { status: 404 });
    }

    const id = cuid();
    const now = new Date().toISOString();
    const method = paymentMethod || "bank";
    const refNo = (referenceNo || "").replace(/'/g, "''");
    const desc = (description || "").replace(/'/g, "''");
    const type = transferType || "loan";
    const attachment = (attachmentUrl || "").replace(/'/g, "''");
    const numAmount = Number(amount);

    // Insert transfer record
    await prisma.$executeRawUnsafe(
      `INSERT INTO intercompany_transfers
        (id, from_company_id, to_company_id, amount, transfer_date, payment_method, reference_no, description, transfer_type, status, approval_status, created_by, created_at, updated_at, attachment_url)
       VALUES
        ('${id}', '${params.companyId}', '${toCompanyId}', ${numAmount}, '${transferDate}', '${method}', '${refNo}', '${desc}', '${type}', 'pending', 'pending', '${session.user.id}', '${now}', '${now}', ${attachment ? `'${attachment}'` : "NULL"})`
    );

    // Auto-create loan_accounts entries if transferType is 'loan'
    if (type === "loan") {
      const loanId1 = cuid();
      const loanId2 = cuid();

      // For sender: loan_receivable (they are owed money)
      await prisma.$executeRawUnsafe(
        `INSERT INTO loan_accounts
          (id, company_id, counterparty_id, counterparty_name, account_type, principal_amount, balance, start_date, status, created_by, created_at, updated_at)
         VALUES
          ('${loanId1}', '${params.companyId}', '${toCompanyId}', ?, 'loan_receivable', ${numAmount}, ${numAmount}, '${transferDate}', 'active', '${session.user.id}', '${now}', '${now}')`,
        toCompany[0].name || "Unknown"
      );

      // For receiver: loan_payable (they owe money)
      const fromCompany: any[] = await prisma.$queryRawUnsafe(
        `SELECT name FROM companies WHERE id = ?`,
        params.companyId
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO loan_accounts
          (id, company_id, counterparty_id, counterparty_name, account_type, principal_amount, balance, start_date, status, created_by, created_at, updated_at)
         VALUES
          ('${loanId2}', '${toCompanyId}', '${params.companyId}', ?, 'loan_payable', ${numAmount}, ${numAmount}, '${transferDate}', 'active', '${session.user.id}', '${now}', '${now}')`,
        fromCompany[0]?.name || "Unknown"
      );
    }

    // Create entry log
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: "intercompany",
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
    console.error("POST /intercompany error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// PUT — Handle actions: edit, approve, reject
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
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    // Verify the transfer exists
    const transfer: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, from_company_id FROM intercompany_transfers WHERE id = ?`,
      id
    );
    if (!transfer.length) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "edit") {
      const { amount, description, paymentMethod, referenceNo } = body;

      const updates: string[] = [];
      const values: any[] = [];

      if (amount !== undefined) {
        updates.push("amount = ?");
        values.push(Number(amount));
      }
      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description);
      }
      if (paymentMethod !== undefined) {
        updates.push("payment_method = ?");
        values.push(paymentMethod);
      }
      if (referenceNo !== undefined) {
        updates.push("reference_no = ?");
        values.push(referenceNo);
      }

      if (updates.length > 0) {
        updates.push("updated_at = ?");
        values.push(now);
        values.push(id);

        const updateClause = updates.join(", ");
        await prisma.$executeRawUnsafe(
          `UPDATE intercompany_transfers SET ${updateClause} WHERE id = ?`,
          ...values
        );
      }

      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "intercompany",
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
        `UPDATE intercompany_transfers SET approval_status = ?, approved_by = ?, approved_at = ?, status = ?, updated_at = ? WHERE id = ?`,
        "approved",
        session.user.id,
        now,
        "completed",
        now,
        id
      );

      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "intercompany",
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
        `UPDATE intercompany_transfers SET approval_status = ?, status = ?, updated_at = ? WHERE id = ?`,
        "rejected",
        "rejected",
        now,
        id
      );

      try {
        await createEntryLog({
          companyId: params.companyId,
          module: "intercompany",
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
    console.error("PUT /intercompany error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// DELETE — Delete a transfer by id
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
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    // Verify the transfer exists
    const transfer: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM intercompany_transfers WHERE id = ?`,
      id
    );
    if (!transfer.length) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    // Delete the transfer
    await prisma.$executeRawUnsafe(`DELETE FROM intercompany_transfers WHERE id = ?`, id);

    // Create entry log for deletion
    try {
      await createEntryLog({
        companyId: params.companyId,
        module: "intercompany",
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
    console.error("DELETE /intercompany error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
