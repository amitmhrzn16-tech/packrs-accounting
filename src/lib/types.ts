export type UserRole = "super_admin" | "company_admin" | "accountant" | "viewer";
export type TransactionType = "income" | "expense";
export type PaymentMethod = "cash" | "bank" | "esewa" | "khalti" | "cheque";
export type TransactionSource = "web" | "slack" | "import";

export interface CompanySummary {
  id: string;
  name: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  transactionCount: number;
}

export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: PaymentMethod;
  isReconciled?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}
