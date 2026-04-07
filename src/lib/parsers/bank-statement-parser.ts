import * as XLSX from "xlsx";
import Papa from "papaparse";
import pdf from "pdf-parse";

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export interface ColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface ParseResult {
  headers: string[];
  previewRows: string[][];
  allRows?: string[][]; // All rows (used for PDF since re-parsing is async)
  totalRows: number;
  suggestedMapping: ColumnMapping | null;
}

// Common header patterns for auto-detection
const DATE_PATTERNS = /date|txn\s*date|transaction\s*date|value\s*date|posting\s*date/i;
const DESC_PATTERNS = /description|narration|particulars|details|remarks|memo/i;
const DEBIT_PATTERNS = /debit|withdrawal|dr|amount\s*debit|debit\s*amount|cash\s*out|cashout|expense|paid|payment/i;
const CREDIT_PATTERNS = /credit|deposit|cr|amount\s*credit|credit\s*amount|cash\s*in|cashin|income|received|receipt/i;
const BALANCE_PATTERNS = /balance|closing|running\s*balance|available/i;

function detectColumnMapping(headers: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};

  headers.forEach((header, index) => {
    const h = header.trim();
    if (DATE_PATTERNS.test(h) && mapping.date === undefined) mapping.date = index;
    else if (DESC_PATTERNS.test(h) && mapping.description === undefined) mapping.description = index;
    else if (DEBIT_PATTERNS.test(h) && mapping.debit === undefined) mapping.debit = index;
    else if (CREDIT_PATTERNS.test(h) && mapping.credit === undefined) mapping.credit = index;
    else if (BALANCE_PATTERNS.test(h) && mapping.balance === undefined) mapping.balance = index;
  });

  if (mapping.date !== undefined && mapping.description !== undefined &&
      (mapping.debit !== undefined || mapping.credit !== undefined)) {
    return {
      date: mapping.date ?? -1,
      description: mapping.description ?? -1,
      debit: mapping.debit ?? -1,
      credit: mapping.credit ?? -1,
      balance: mapping.balance ?? -1,
    };
  }

  return null;
}

function parseExcelDate(value: any): string {
  if (!value && value !== 0) return "";

  // Handle Date objects directly (from cellDates: true)
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    return "";
  }

  if (typeof value === "string") {
    let trimmed = value.trim();
    if (!trimmed) return "";

    // Strip time portion if present (e.g., "2026-03-29 12:00:00" or "3/29/2026 12:00:00 PM")
    // Remove everything after a time-like pattern
    trimmed = trimmed.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, "").trim();

    // Try standard ISO-like date parsing (YYYY-MM-DD, etc.)
    const d = new Date(trimmed);
    if (!isNaN(d.getTime()) && trimmed.length >= 6) {
      return d.toISOString().slice(0, 10);
    }
    // Try DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    const parts = trimmed.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number);
      if (isNaN(a) || isNaN(b) || isNaN(c)) return trimmed;
      if (a > 100) {
        // YYYY-MM-DD or YYYY/MM/DD
        return `${a}-${b.toString().padStart(2, "0")}-${c.toString().padStart(2, "0")}`;
      }
      if (a > 12) {
        // DD/MM/YYYY
        const year = c > 100 ? c : 2000 + c;
        return `${year}-${b.toString().padStart(2, "0")}-${a.toString().padStart(2, "0")}`;
      }
      if (b > 12) {
        // MM/DD/YYYY
        const year = c > 100 ? c : 2000 + c;
        return `${year}-${a.toString().padStart(2, "0")}-${b.toString().padStart(2, "0")}`;
      }
      // Ambiguous — assume DD/MM/YYYY (Nepal standard)
      const year = c > 100 ? c : 2000 + c;
      return `${year}-${b.toString().padStart(2, "0")}-${a.toString().padStart(2, "0")}`;
    }
    // Last resort: try Date constructor on original value
    const lastTry = new Date(value.trim());
    if (!isNaN(lastTry.getTime())) {
      return lastTry.toISOString().slice(0, 10);
    }
    return trimmed;
  }

  // Excel serial date number
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + value * 86400000);
    return jsDate.toISOString().slice(0, 10);
  }

  return String(value);
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.abs(value);
  const cleaned = String(value).replace(/[,\s]/g, "").replace(/[()]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

// ─── EXCEL / XLS PARSING ──────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (err: any) {
    console.error("Excel parse error:", err?.message || err);
    // Try parsing as CSV fallback (some files are CSVs saved with .xlsx extension)
    try {
      const textContent = buffer.toString("utf-8");
      if (textContent.includes(",") && textContent.includes("\n")) {
        return parseCsvString(textContent);
      }
    } catch { /* ignore */ }
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Use raw: false to get formatted strings (preserves dates as readable text)
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (rawData.length < 2) {
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }

  // Also read with raw: true to get actual values for numeric processing
  const rawDataValues: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  let headerRowIndex = findHeaderRow(rawData);
  const headers = rawData[headerRowIndex].map((h: any) => String(h).trim());
  const dataRows = rawData.slice(headerRowIndex + 1).filter(
    (row: any[]) => row.some((cell: any) => cell !== "" && cell != null)
  );

  const previewRows = dataRows.slice(0, 10).map((row: any[]) =>
    row.map((cell: any) => {
      // Format Date objects to readable strings
      if (cell instanceof Date) {
        return cell.toISOString().slice(0, 10);
      }
      return String(cell ?? "");
    })
  );

  return {
    headers,
    previewRows,
    totalRows: dataRows.length,
    suggestedMapping: detectColumnMapping(headers),
  };
}

// ─── CSV PARSING ──────────────────────────────────────────────

export function parseCsvString(csvString: string): ParseResult {
  const result = Papa.parse(csvString, { skipEmptyLines: true });
  const rawData = result.data as string[][];

  if (rawData.length < 2) {
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }

  const headers = rawData[0].map((h) => h.trim());
  const dataRows = rawData.slice(1);
  const previewRows = dataRows.slice(0, 10);

  return {
    headers,
    previewRows,
    totalRows: dataRows.length,
    suggestedMapping: detectColumnMapping(headers),
  };
}

// ─── PDF PARSING ──────────────────────────────────────────────

/**
 * Parses a PDF bank statement using pdf-parse for text extraction.
 *
 * Handles two common PDF bank statement formats:
 * 1. Multi-line positional format (e.g., Nepali banks like Kumari Bank):
 *    - Transaction date and description on one line
 *    - Amounts (debit/credit/balance) on the NEXT line, positioned by column
 *    - Time portion ("00:00:00") on another continuation line
 * 2. Single-line format: date, description, amounts all on one line
 *
 * For multi-line formats, we use column position analysis to separate
 * debit, credit, and balance amounts.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParseResult> {
  let pdfData;
  try {
    pdfData = await pdf(buffer);
  } catch (err: any) {
    console.error("PDF parse error:", err?.message || err);
    // Try to extract text as plain text fallback (some "PDFs" are actually text files)
    try {
      const textContent = buffer.toString("utf-8");
      if (textContent.includes(",") && textContent.includes("\n")) {
        // This looks like a CSV file saved with .pdf extension
        return parseCsvString(textContent);
      }
    } catch { /* ignore */ }
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }

  const text = pdfData.text;
  if (!text || text.trim().length === 0) {
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }

  const lines = text.split("\n");

  if (lines.length < 5) {
    return { headers: [], previewRows: [], totalRows: 0, suggestedMapping: null };
  }

  // ─── Detect Nepali bank statement format (pdf-parse strips layout) ───
  // Pattern: date line → time line → value date → time line → description → amounts
  // The key indicator is: lines that are just "00:00:00" (time portions)
  const timeOnlyLines = lines.filter((l) => l.trim() === "00:00:00").length;
  const dateOnlyLines = lines.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.trim())).length;

  if (timeOnlyLines > 5 && dateOnlyLines > 5) {
    return parseNepaliBankPdf(lines);
  }

  // ─── Detect tabular PDF format (columns concatenated without spaces) ───
  // Pattern: "2026-04-01Head Officecash" (date glued to other column text)
  // followed by multi-line description, last line has amounts concatenated
  const dateGluedPattern = /^\d{4}-\d{2}-\d{2}[A-Za-z]/;
  const dateGluedLines = lines.filter((l) => dateGluedPattern.test(l.trim())).length;
  if (dateGluedLines >= 3) {
    return parseTabularPdf(lines);
  }

  // ─── Generic single-line PDF format ───
  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  return parseSingleLinePdf(trimmedLines);
}

/**
 * Parse Nepali bank statement PDF (Kumari Bank, NMB, etc.)
 *
 * pdf-parse strips positional layout, so each text element is on its own line.
 * Transaction pattern:
 *   "2026-03-01"              ← transaction date
 *   "00:00:00"                ← time (ignored)
 *   "2026-03-01"              ← value date (ignored)
 *   "00:00:00"                ← time (ignored)
 *   "prem Feb 28:IS-..."      ← description (may be multiple lines)
 *   "24-FPQR"                 ← description continuation (optional)
 *   "5895.0093466.08"         ← amount+balance concatenated
 *
 * The amount line contains 2 numbers glued together: [amount][balance]
 * We separate them by comparing with the previous balance to determine
 * if the transaction is a debit (balance decreased) or credit (balance increased).
 */
function parseNepaliBankPdf(lines: string[]): ParseResult {
  const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
  // Match a line that's purely numbers (possibly with dots) — the amount line
  const amountLineRegex = /^[\d.]+$/;

  const transactions: string[][] = [];
  let prevBalance: number | null = null;
  let i = 0;

  // Skip to first transaction (past header/metadata)
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (dateRegex.test(trimmed) && !isMetadataDate(lines, i)) break;
    // Try to find opening balance from header area
    if (trimmed.includes("Available Balance") || trimmed.includes("Opening Balance")) {
      // Look for the balance value nearby
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const num = parseFloat(lines[j].trim().replace(/,/g, ""));
        if (!isNaN(num) && num > 0) {
          // This might be picked up from context
          break;
        }
      }
    }
    i++;
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Skip empty lines, headers, page footers
    if (!trimmed || trimmed === "Account Activity" ||
        trimmed.startsWith("DateValue Date") ||
        trimmed.startsWith("(Disclaimer") ||
        trimmed.startsWith("System provided") ||
        trimmed.includes("Print By") || trimmed.includes("Print On") ||
        /^\d+Page/.test(trimmed)) {
      i++;
      continue;
    }

    // Look for transaction start: a date line
    if (!dateRegex.test(trimmed)) {
      i++;
      continue;
    }

    // Check if this is a metadata date (From Date / To Date)
    if (isMetadataDate(lines, i)) {
      i++;
      continue;
    }

    const date = trimmed;
    i++;

    // Skip time line
    if (i < lines.length && timeRegex.test(lines[i].trim())) i++;

    // Skip value date
    if (i < lines.length && dateRegex.test(lines[i].trim())) i++;

    // Skip value date time
    if (i < lines.length && timeRegex.test(lines[i].trim())) i++;

    // Collect description lines (everything until the amount line)
    let description = "";
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }

      // Check if this is an amount line (only digits and dots, like "5895.0093466.08")
      if (amountLineRegex.test(line) && line.includes(".")) {
        break;
      }

      // Check if this is a new date (we've hit the next transaction without amounts)
      if (dateRegex.test(line)) break;

      // Skip page breaks, headers
      if (line === "Account Activity" || line.startsWith("DateValue Date") ||
          /^\d+Page/.test(line) || line.startsWith("(Disclaimer") ||
          line.startsWith("System provided") || line.includes("Print By")) {
        i++;
        continue;
      }

      // It's description text
      description += (description ? " " : "") + line;
      i++;
    }

    // Parse the amount line
    let debit = "";
    let credit = "";
    let balance = "";

    if (i < lines.length) {
      const amountStr = lines[i].trim();
      if (amountLineRegex.test(amountStr) && amountStr.includes(".")) {
        const parsed = splitConcatenatedAmounts(amountStr, prevBalance);
        debit = parsed.debit;
        credit = parsed.credit;
        balance = parsed.balance;

        if (parsed.balanceNum !== null) {
          prevBalance = parsed.balanceNum;
        }
        i++;
      }
    }

    // Clean description
    description = description.replace(/\s+/g, " ").trim();

    if (date && (debit || credit)) {
      transactions.push([date, description, debit, credit, balance]);
    }
  }

  // Fix the first transaction's debit/credit if we couldn't determine it
  // By now we know the second transaction's balance, so we can look backward
  if (transactions.length >= 2) {
    const first = transactions[0];
    const firstBalance = parseFloat(first[4].replace(/,/g, "")) || 0;
    const firstAmount = parseFloat((first[2] || first[3]).replace(/,/g, "")) || 0;
    const secondBalance = parseFloat(transactions[1][4].replace(/,/g, "")) || 0;
    const secondAmount = parseFloat((transactions[1][2] || transactions[1][3]).replace(/,/g, "")) || 0;

    // Calculate what the opening balance must have been
    // openingBalance + credit - debit = firstBalance
    // If the second transaction's balance logic is: firstBalance ± secondAmount = secondBalance
    // Then: if secondBalance > firstBalance, second is credit → check if first needs fixing
    if (!first[2] && !first[3] && first[4]) {
      // First transaction had no amount determined — skip
    } else if (first[2] && !first[3]) {
      // Classified as debit — verify: openingBalance - firstAmount = firstBalance
      // → openingBalance = firstBalance + firstAmount
      // This is plausible if openingBalance > firstBalance
    } else if (!first[2] && first[3]) {
      // Classified as credit — this is the default when prevBalance was null
      // No change needed
    }
  }

  return {
    headers,
    previewRows: transactions.slice(0, 10),
    allRows: transactions,
    totalRows: transactions.length,
    suggestedMapping: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 },
  };
}

/**
 * Check if a date line at position i is metadata (From Date / To Date) not a transaction.
 */
function isMetadataDate(lines: string[], i: number): boolean {
  // Check the immediately preceding lines for "From Date" or "To Date"
  for (let j = Math.max(0, i - 2); j < i; j++) {
    const t = lines[j].trim();
    if (t === "From Date" || t === "To Date") {
      return true;
    }
  }
  return false;
}

/**
 * Split a concatenated amount string like "5895.0093466.08" into amount + balance.
 *
 * Strategy: The string has exactly 2 decimal numbers glued together.
 * Find the split point by looking for the pattern: digits.digits+digits.digits
 * Then use the previous balance to determine if the amount is debit or credit.
 */
function splitConcatenatedAmounts(
  amountStr: string,
  prevBalance: number | null
): { debit: string; credit: string; balance: string; balanceNum: number | null } {
  // Find all possible split points where we can get two valid decimal numbers
  // Pattern: the string contains exactly 2 numbers with decimals
  // e.g., "5895.0093466.08" → "5895.00" + "93466.08"
  // e.g., "30013.0063453.08" → "30013.00" + "63453.08"

  const dotPositions: number[] = [];
  for (let j = 0; j < amountStr.length; j++) {
    if (amountStr[j] === ".") dotPositions.push(j);
  }

  if (dotPositions.length === 2) {
    // Two decimal points: split after the first decimal number ends
    // First number ends 2 digits after first dot (assumes 2 decimal places)
    const firstDot = dotPositions[0];
    const splitPos = firstDot + 3; // e.g., "5895.00" → split at index 7

    const amountPart = amountStr.slice(0, splitPos);
    const balancePart = amountStr.slice(splitPos);

    const amountNum = parseFloat(amountPart.replace(/,/g, ""));
    const balanceNum = parseFloat(balancePart.replace(/,/g, ""));

    if (!isNaN(amountNum) && !isNaN(balanceNum)) {
      // Determine debit vs credit by comparing with previous balance
      let isDebit = false;
      if (prevBalance !== null) {
        // If balance decreased, it's a debit; if increased, it's a credit
        isDebit = balanceNum < prevBalance;
      } else {
        // Without previous balance, we can't determine direction
        // Default to credit (common for first transaction)
        isDebit = false;
      }

      return {
        debit: isDebit ? amountPart : "",
        credit: isDebit ? "" : amountPart,
        balance: balancePart,
        balanceNum,
      };
    }
  }

  // Fallback: if we can't split properly, treat the whole thing as balance
  const num = parseFloat(amountStr.replace(/,/g, ""));
  return {
    debit: "",
    credit: "",
    balance: amountStr,
    balanceNum: isNaN(num) ? null : num,
  };
}

/**
 * Parse tabular PDF where pdf-parse concatenates columns without spaces.
 *
 * Pattern from the raw text:
 *   "DateBranchAccountParticularsDr. AmountCr. AmountClosing Balance"  ← header (all glued)
 *   "2026-04-01Head Officecash"      ← date + branch + account concatenated
 *   "Daily "                          ← description line 1
 *   "Collection - "                   ← description line 2
 *   "manoj Thapa "                    ← description line 3 (may or may not have amounts)
 *   "Magar45219867"                   ← last desc line + amounts concatenated
 *
 * The amounts are at the END of the last line before the next date line.
 * We extract trailing numbers from that line. Numbers are concatenated:
 *   - 2 numbers = [dr_or_cr_amount, closing_balance]
 *   - 3 numbers = [dr_amount, cr_amount, closing_balance] (rare)
 */
function parseTabularPdf(lines: string[]): ParseResult {
  const headers = ["Date", "Description", "Dr. Amount", "Cr. Amount", "Closing Balance"];
  const dateGluedPattern = /^(\d{4}-\d{2}-\d{2})/;
  const transactions: string[][] = [];
  let prevBalance: number | null = null;

  let i = 0;

  // Skip to first transaction line
  while (i < lines.length && !dateGluedPattern.test(lines[i].trim())) {
    i++;
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    const dateMatch = trimmed.match(dateGluedPattern);
    if (!dateMatch) { i++; continue; }

    const date = dateMatch[1];
    i++;

    // Collect all lines until the next date line (or end of file)
    // These lines contain: description text + amounts on the last line
    const contentLines: string[] = [];
    while (i < lines.length) {
      const nextTrimmed = lines[i].trim();
      if (!nextTrimmed) { i++; continue; }
      // Check if this is a new transaction (starts with date)
      if (dateGluedPattern.test(nextTrimmed)) break;
      contentLines.push(nextTrimmed);
      i++;
    }

    if (contentLines.length === 0) continue;

    // The amounts are trailing numbers on the LAST content line
    // e.g., "Magar45219867" or "Balance1941519415" or "Prabin magar910060289"
    // Strategy: find where text ends and numbers begin in the last line,
    // then split the trailing number portion into amount(s) + balance
    const lastLine = contentLines[contentLines.length - 1];

    // Find the position where trailing digits start (numbers at the end)
    // Look for the transition from letter/space to digit
    let numStart = -1;
    for (let j = lastLine.length - 1; j >= 0; j--) {
      if (/\d/.test(lastLine[j])) {
        numStart = j;
      } else {
        break;
      }
    }

    if (numStart === -1) continue; // No numbers found

    const textPart = lastLine.slice(0, numStart).trim();
    const numberPart = lastLine.slice(numStart);

    // Build description from all content lines, replacing the last line's text portion
    const descParts = contentLines.slice(0, -1).map((l) => l.trim());
    if (textPart) descParts.push(textPart);
    let description = descParts.join(" ").replace(/\s+/g, " ").trim();

    // Now split the concatenated numbers into amount + balance
    // The numbers don't have separators, so we use balance comparison
    // If we know the previous balance, we can determine the split point
    let debit = "";
    let credit = "";
    let balance = "";

    if (prevBalance !== null) {
      // Try all possible split positions to find one where:
      // prevBalance + credit - debit = newBalance
      let found = false;
      for (let splitPos = 1; splitPos < numberPart.length; splitPos++) {
        const amountStr = numberPart.slice(0, splitPos);
        const balanceStr = numberPart.slice(splitPos);
        const amountNum = parseFloat(amountStr);
        const balanceNum = parseFloat(balanceStr);

        if (isNaN(amountNum) || isNaN(balanceNum) || amountNum <= 0 || balanceNum <= 0) continue;

        // Check if this split makes sense:
        // Credit: prevBalance + amount = balance
        if (Math.abs(prevBalance + amountNum - balanceNum) < 0.01) {
          credit = amountStr;
          balance = balanceStr;
          prevBalance = balanceNum;
          found = true;
          break;
        }
        // Debit: prevBalance - amount = balance
        if (Math.abs(prevBalance - amountNum - balanceNum) < 0.01) {
          debit = amountStr;
          balance = balanceStr;
          prevBalance = balanceNum;
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback: assume the larger number is the balance (it's at the end)
        // Split roughly in the middle by trying common patterns
        const midPoint = Math.ceil(numberPart.length / 2);
        const amountStr = numberPart.slice(0, midPoint);
        const balanceStr = numberPart.slice(midPoint);
        const amountNum = parseFloat(amountStr);
        const balanceNum = parseFloat(balanceStr);
        if (!isNaN(amountNum) && !isNaN(balanceNum)) {
          if (balanceNum > prevBalance) {
            credit = amountStr;
          } else {
            debit = amountStr;
          }
          balance = balanceStr;
          prevBalance = balanceNum;
        }
      }
    } else {
      // First transaction (no previous balance to compare)
      // Special case: "Opening Balance" → the number IS the balance
      if (description.toLowerCase().includes("opening") && description.toLowerCase().includes("balance")) {
        // For opening balance like "1941519415": amount = balance (same number repeated)
        // Or it could be a single number if there's only a balance
        // Try to see if the number is a repeated value
        const halfLen = numberPart.length / 2;
        if (numberPart.length % 2 === 0 && numberPart.slice(0, halfLen) === numberPart.slice(halfLen)) {
          // Same number repeated twice: "1941519415" → amount=19415, balance=19415
          debit = numberPart.slice(0, halfLen);
          balance = numberPart.slice(halfLen);
          prevBalance = parseFloat(balance) || null;
        } else {
          // Try splitting: amount + balance where they differ
          for (let splitPos = 1; splitPos < numberPart.length; splitPos++) {
            const a = numberPart.slice(0, splitPos);
            const b = numberPart.slice(splitPos);
            const aNum = parseFloat(a);
            const bNum = parseFloat(b);
            if (!isNaN(aNum) && !isNaN(bNum) && aNum === bNum) {
              debit = a;
              balance = b;
              prevBalance = bNum;
              break;
            }
          }
          if (!balance) {
            // Can't split — treat entire thing as balance
            balance = numberPart;
            prevBalance = parseFloat(numberPart) || null;
          }
        }
      } else {
        // First non-opening transaction without prevBalance
        // Can't determine split reliably; try half-split
        const halfLen = Math.ceil(numberPart.length / 2);
        credit = numberPart.slice(0, halfLen);
        balance = numberPart.slice(halfLen);
        prevBalance = parseFloat(balance) || null;
      }
    }

    if (date) {
      transactions.push([date, description, debit, credit, balance]);
    }
  }

  return {
    headers,
    previewRows: transactions.slice(0, 10),
    allRows: transactions,
    totalRows: transactions.length,
    suggestedMapping: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 },
  };
}

/**
 * Parse single-line PDF format (date + description + amounts on one line).
 */
function parseSingleLinePdf(lines: string[]): ParseResult {
  const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
  const dateRegex = /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
  const dateRegex2 = /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4}/i;

  const transactionRows: string[][] = [];

  for (const line of lines) {
    if (!dateRegex.test(line) && !dateRegex2.test(line)) continue;

    const row = splitPdfLineIntoColumns(line, headers.length);
    if (row) {
      transactionRows.push(row);
    }
  }

  if (transactionRows.length === 0) {
    return parsePdfFallback(lines, headers);
  }

  return {
    headers,
    previewRows: transactionRows.slice(0, 10),
    allRows: transactionRows,
    totalRows: transactionRows.length,
    suggestedMapping: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 },
  };
}

/**
 * Split a single PDF text line into columns based on number detection.
 */
function splitPdfLineIntoColumns(line: string, expectedCols: number): string[] | null {
  const dateMatch = line.match(/^(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+/);
  if (!dateMatch) return null;

  const date = dateMatch[1];
  let rest = line.slice(dateMatch[0].length);

  const amounts: string[] = [];
  const amountRegex = /[\d,]+\.?\d*$/;

  for (let attempt = 0; attempt < 3; attempt++) {
    rest = rest.trim();
    const match = rest.match(amountRegex);
    if (match) {
      amounts.unshift(match[0]);
      rest = rest.slice(0, rest.length - match[0].length).trim();
    } else {
      break;
    }
  }

  if (amounts.length === 0) return null;

  const description = rest.trim();
  const row = [date, description, ...amounts];
  while (row.length < expectedCols) {
    row.splice(2, 0, "");
  }

  return row.slice(0, expectedCols);
}

/**
 * Fallback PDF parser for unstructured layouts.
 */
function parsePdfFallback(lines: string[], defaultHeaders: string[]): ParseResult {
  const dateRegex = /\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
  const rows: string[][] = [];

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const date = dateMatch[0];
    const rest = line.replace(dateMatch[0], "").trim();

    const numbers = rest.match(/[\d,]+\.?\d+/g) || [];
    const description = rest.replace(/[\d,]+\.?\d+/g, "").replace(/\s+/g, " ").trim();

    if (numbers.length >= 1) {
      const row = [date, description];
      // Assign numbers to debit, credit, balance columns
      if (numbers.length === 1) {
        row.push(numbers[0], "", "");
      } else if (numbers.length === 2) {
        row.push(numbers[0], numbers[1], "");
      } else {
        row.push(numbers[0], numbers[1], numbers[2]);
      }
      rows.push(row);
    }
  }

  return {
    headers: defaultHeaders,
    previewRows: rows.slice(0, 10),
    allRows: rows,
    totalRows: rows.length,
    suggestedMapping: rows.length > 0
      ? { date: 0, description: 1, debit: 2, credit: 3, balance: 4 }
      : null,
  };
}

// ─── SHARED HELPERS ───────────────────────────────────────────

function findHeaderRow(rawData: any[][]): number {
  // Strategy: Find the row that looks most like a header.
  // A header row should contain text labels (not dates/numbers) and
  // match common bank statement column patterns.
  const headerPatterns = /date|tran|desc|particular|narration|detail|remark|debit|credit|withdraw|deposit|balance|amount|dr|cr|ref/i;

  let bestRow = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rawData.length, 15); i++) {
    const row = rawData[i];
    if (!row) continue;

    const nonEmpty = row.filter((cell: any) => cell !== "" && cell != null).length;
    if (nonEmpty < 3) continue;

    // Score: how many cells match header-like patterns
    let score = 0;
    for (const cell of row) {
      const str = String(cell ?? "").trim();
      if (headerPatterns.test(str)) score += 2;
      // Bonus for non-numeric text (headers are usually text labels)
      if (str && isNaN(Number(str)) && !(str instanceof Date)) score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  // If no header-like row found, fall back to first row with 3+ cells
  if (bestScore === 0) {
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const nonEmpty = rawData[i].filter((cell: any) => cell !== "" && cell != null).length;
      if (nonEmpty >= 3) return i;
    }
  }

  return bestRow;
}

// ─── EXTRACT ROWS WITH CONFIRMED MAPPING ──────────────────────

export function extractRowsWithMapping(
  buffer: Buffer,
  fileType: "xlsx" | "csv" | "pdf",
  mapping: ColumnMapping,
  pdfParsedRows?: string[][] // Pre-parsed PDF rows (since PDF parsing is async)
): ParsedRow[] {
  let rawData: any[][];

  if (fileType === "pdf") {
    if (!pdfParsedRows) return [];
    rawData = [["header_placeholder"], ...pdfParsedRows]; // Add fake header
  } else if (fileType === "xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  } else {
    const result = Papa.parse(buffer.toString("utf-8"), { skipEmptyLines: true });
    rawData = result.data as string[][];
  }

  // Skip header row
  let headerRowIndex = 0;
  if (fileType !== "pdf") {
    headerRowIndex = findHeaderRow(rawData);
  }

  const dataRows = rawData.slice(headerRowIndex + 1).filter(
    (row: any[]) => row.some((cell: any) => cell !== "" && cell != null)
  );

  return dataRows.map((row) => ({
    date: parseExcelDate(mapping.date >= 0 ? row[mapping.date] : null),
    description: String(mapping.description >= 0 ? row[mapping.description] ?? "" : ""),
    debit: parseNumber(mapping.debit >= 0 ? row[mapping.debit] : null),
    credit: parseNumber(mapping.credit >= 0 ? row[mapping.credit] : null),
    balance: parseNumber(mapping.balance != null && mapping.balance >= 0 ? row[mapping.balance] : null),
  })).filter((row) => {
    // Must have a date, and at least one of debit or credit must be a non-null number
    const hasDate = row.date && row.date.length > 0;
    const hasAmount = (row.debit !== null && row.debit > 0) || (row.credit !== null && row.credit > 0);
    return hasDate && hasAmount;
  });
}
