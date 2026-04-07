import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  parseExcelBuffer,
  parseCsvString,
  parsePdfBuffer,
  extractRowsWithMapping,
  type ColumnMapping,
} from "@/lib/parsers/bank-statement-parser";


async function verifyAccess(userId: string, companyId: string) {
  return prisma.companyUser.findFirst({ where: { userId, companyId } });
}

/**
 * POST /api/companies/[companyId]/import
 *
 * Step 1: Upload file → parse → return preview + suggested column mapping
 * Step 2: Confirm mapping → import rows → auto-match → return results
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const step = formData.get("step") as string; // "preview" or "confirm"
    const mappingJson = formData.get("mapping") as string | null;
    const batchId = formData.get("batchId") as string | null;
    const paymentMethodOverride = formData.get("paymentMethod") as string | null;

    // ─── STEP 1: PREVIEW ────────────────────────────────────────
    if (step === "preview") {
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const fileName = file.name;
      const ext = fileName.split(".").pop()?.toLowerCase();

      if (!["xlsx", "xls", "csv", "pdf"].includes(ext || "")) {
        return NextResponse.json(
          { error: "Invalid file type. Upload .xlsx, .xls, .csv, or .pdf" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileType = ext === "pdf" ? "pdf" : ext === "csv" ? "csv" : "xlsx";

      let parseResult;

      try {
        if (fileType === "pdf") {
          parseResult = await parsePdfBuffer(buffer);
        } else if (fileType === "csv") {
          parseResult = parseCsvString(buffer.toString("utf-8"));
        } else {
          parseResult = parseExcelBuffer(buffer);
        }
      } catch (parseError: any) {
        console.error("File parse error:", parseError);
        return NextResponse.json(
          { error: `Failed to parse ${fileType.toUpperCase()} file: ${parseError?.message || "Unknown error"}. Make sure the file is a valid ${fileType.toUpperCase()} document.` },
          { status: 400 }
        );
      }

      if (parseResult.totalRows === 0) {
        return NextResponse.json(
          { error: `No data rows found in the ${fileType.toUpperCase()} file. Make sure the file contains transaction data with dates and amounts.` },
          { status: 400 }
        );
      }

      // Create an import batch to track this upload
      const batch = await prisma.importBatch.create({
        data: {
          companyId: params.companyId,
          fileName,
          fileType,
          rowCount: parseResult.totalRows,
          importedBy: session.user.id,
        },
      });

      // Store the raw file buffer temporarily (base64 in fileUrl field)
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { fileUrl: buffer.toString("base64") },
      });

      return NextResponse.json({
        batchId: batch.id,
        headers: parseResult.headers,
        previewRows: parseResult.previewRows,
        totalRows: parseResult.totalRows,
        suggestedMapping: parseResult.suggestedMapping,
      });
    }

    // ─── STEP 2: CONFIRM MAPPING & IMPORT ───────────────────────
    if (step === "confirm") {
      if (!batchId || !mappingJson) {
        return NextResponse.json(
          { error: "batchId and mapping are required" },
          { status: 400 }
        );
      }

      const mapping: ColumnMapping = JSON.parse(mappingJson);

      // Retrieve the stored file from the batch
      const batch = await prisma.importBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch || !batch.fileUrl) {
        return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
      }

      const buffer = Buffer.from(batch.fileUrl, "base64");
      const fileType = batch.fileType as "xlsx" | "csv" | "pdf";

      // For PDF files, re-parse to get all transaction rows
      // since extractRowsWithMapping needs pre-parsed rows for PDFs
      let pdfAllRows: string[][] | undefined;
      if (fileType === "pdf") {
        const pdfResult = await parsePdfBuffer(buffer);
        pdfAllRows = pdfResult.allRows || pdfResult.previewRows;
      }

      // Extract rows using the confirmed mapping
      const parsedRows = extractRowsWithMapping(buffer, fileType, mapping, pdfAllRows);

      // If no rows were parsed, return a helpful error
      if (parsedRows.length === 0) {
        return NextResponse.json({
          error: "No valid transaction rows found. Check that column mapping is correct and the file contains dates and amounts.",
          imported: 0,
          matched: 0,
          unmatched: 0,
          transactions: 0,
          debug: { fileType, mapping, pdfRowCount: pdfAllRows?.length ?? 0 },
        }, { status: 200 });
      }

      // Create bank transactions AND corresponding book entries (Transaction records)
      // so they appear in Income/Expense pages as well as Reconciliation
      const bankTxns = [];
      const createdTransactions = [];

      for (const row of parsedRows) {
        // Determine if this is income (credit) or expense (debit)
        const isIncome = (row.credit ?? 0) > 0;
        const amount = isIncome ? (row.credit ?? 0) : (row.debit ?? 0);

        // Skip rows with zero amounts
        if (amount === 0) continue;

        // Create the bank transaction record
        const bankTxn = await prisma.bankTransaction.create({
          data: {
            companyId: params.companyId,
            importBatchId: batchId,
            date: row.date,
            description: row.description,
            debit: row.debit,
            credit: row.credit,
            balance: row.balance,
          },
        });
        bankTxns.push(bankTxn);

        // Also create a Transaction (book entry) so it shows in Income/Expense pages
        const transaction = await prisma.transaction.create({
          data: {
            companyId: params.companyId,
            type: isIncome ? "income" : "expense",
            amount,
            particulars: row.description || (paymentMethodOverride === "cash" ? "Imported from cash statement" : "Imported from bank statement"),
            date: row.date,
            paymentMethod: paymentMethodOverride || "bank",
            createdById: session.user.id,
            source: "import",
            isReconciled: true,
            bankTxnId: bankTxn.id,
          },
        });
        createdTransactions.push(transaction);

        // Mark the bank transaction as matched to this new book entry
        await prisma.bankTransaction.update({
          where: { id: bankTxn.id },
          data: {
            isMatched: true,
            matchedTxnId: transaction.id,
            matchConfidence: 1.0,
          },
        });
      }

      // Update batch row count and clear stored buffer
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          rowCount: bankTxns.length,
          fileUrl: null, // Clear the stored buffer
        },
      });

      // Create audit log for the import
      await prisma.auditLog.create({
        data: {
          companyId: params.companyId,
          userId: session.user.id,
          action: "create",
          entityType: "bank_statement",
          entityId: batchId,
          newValues: JSON.stringify({ imported: bankTxns.length }),
        },
      });

      return NextResponse.json({
        imported: bankTxns.length,
        matched: bankTxns.length,
        unmatched: 0,
        transactions: createdTransactions.length,
      });
    }

    return NextResponse.json({ error: "Invalid step parameter" }, { status: 400 });
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: `Import failed: ${error?.message || "Unknown server error"}` },
      { status: 500 }
    );
  }
}
