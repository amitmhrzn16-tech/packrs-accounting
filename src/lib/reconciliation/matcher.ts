/**
 * Auto-matching engine for bank reconciliation.
 * Matches imported bank transactions against existing book entries
 * using fuzzy date matching (± 2 days) and exact amount matching.
 */

interface BookEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: "income" | "expense";
  particulars: string | null;
  isReconciled: boolean;
}

interface BankEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  debit: number | null;
  credit: number | null;
}

export interface MatchResult {
  bankTxnId: string;
  matchedTxnId: string;
  confidence: number; // 0.0 to 1.0
  matchReason: string;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / 86400000));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 1;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.7;

  // Word overlap
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union > 0 ? intersection / union : 0;
}

export function autoMatchTransactions(
  bankEntries: BankEntry[],
  bookEntries: BookEntry[]
): MatchResult[] {
  const matches: MatchResult[] = [];
  const matchedBookIds = new Set<string>();
  const matchedBankIds = new Set<string>();

  // Only consider unreconciled book entries
  const unreconciledBooks = bookEntries.filter((b) => !b.isReconciled);

  // Score all potential matches
  const candidates: Array<{
    bankTxnId: string;
    matchedTxnId: string;
    score: number;
    reason: string;
  }> = [];

  for (const bank of bankEntries) {
    // Determine the bank amount — debit = expense outflow, credit = income inflow
    const bankAmount = bank.credit || bank.debit;
    if (!bankAmount) continue;

    const bankIsIncome = (bank.credit ?? 0) > 0;

    for (const book of unreconciledBooks) {
      // Type must match: credit → income, debit → expense
      if (bankIsIncome && book.type !== "income") continue;
      if (!bankIsIncome && book.type !== "expense") continue;

      // Amount must match exactly (within 0.01 tolerance)
      const amountDiff = Math.abs(bankAmount - book.amount);
      if (amountDiff > 0.01) continue;

      // Date must be within ±2 days
      const dateDiff = daysBetween(bank.date, book.date);
      if (dateDiff > 2) continue;

      // Calculate confidence score
      let score = 0.5; // Base score for amount match

      // Date proximity bonus
      if (dateDiff === 0) score += 0.3;
      else if (dateDiff === 1) score += 0.15;
      else score += 0.05;

      // Text similarity bonus
      if (bank.description && book.particulars) {
        score += textSimilarity(bank.description, book.particulars) * 0.2;
      }

      const reasons: string[] = [];
      reasons.push("Amount match");
      if (dateDiff === 0) reasons.push("Exact date match");
      else reasons.push(`Date within ${dateDiff} day(s)`);

      candidates.push({
        bankTxnId: bank.id,
        matchedTxnId: book.id,
        score: Math.min(score, 1),
        reason: reasons.join(", "),
      });
    }
  }

  // Sort by score descending and greedily assign best matches
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (matchedBankIds.has(c.bankTxnId) || matchedBookIds.has(c.matchedTxnId)) {
      continue;
    }

    matches.push({
      bankTxnId: c.bankTxnId,
      matchedTxnId: c.matchedTxnId,
      confidence: parseFloat(c.score.toFixed(2)),
      matchReason: c.reason,
    });

    matchedBankIds.add(c.bankTxnId);
    matchedBookIds.add(c.matchedTxnId);
  }

  return matches;
}
