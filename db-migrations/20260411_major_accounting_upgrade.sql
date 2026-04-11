-- Major accounting upgrade: approval workflow, audit logs, intercompany, contra, bank recon, interest
-- Run: sqlite3 prisma/dev.db < db-migrations/20260411_major_accounting_upgrade.sql

-- ==========================================
-- 1. ENTRY LOG / AUDIT TABLE (universal for all modules)
-- ==========================================
CREATE TABLE IF NOT EXISTS entry_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL,          -- 'income','expense','daily_cash','salary','advance','intercompany','contra'
  entry_id TEXT NOT NULL,        -- ID of the record in the module table
  action TEXT NOT NULL,          -- 'created','edited','deleted','approved','rejected','recovered'
  field_changes TEXT,            -- JSON: { field: { old: x, new: y } }
  performed_by TEXT NOT NULL,    -- user id
  performed_by_name TEXT,        -- user name (denormalized for speed)
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_entry_logs_entry ON entry_logs(module, entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_logs_company ON entry_logs(company_id, created_at);

-- ==========================================
-- 2. APPROVAL STATUS COLUMNS on all module tables
-- ==========================================
-- transactions (income/expense)
ALTER TABLE transactions ADD COLUMN approval_status TEXT DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN approved_by TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN approved_at TEXT DEFAULT NULL;

-- daily_cash_payments — already has status/approved_by, add approved_at
ALTER TABLE daily_cash_payments ADD COLUMN approved_at TEXT DEFAULT NULL;

-- salary_payments — add approval columns
ALTER TABLE salary_payments ADD COLUMN approval_status TEXT DEFAULT 'pending';
ALTER TABLE salary_payments ADD COLUMN approved_by TEXT DEFAULT NULL;
ALTER TABLE salary_payments ADD COLUMN approved_at TEXT DEFAULT NULL;

-- advance_payments — add approval columns
ALTER TABLE advance_payments ADD COLUMN approval_status TEXT DEFAULT 'pending';
ALTER TABLE advance_payments ADD COLUMN approved_by TEXT DEFAULT NULL;
ALTER TABLE advance_payments ADD COLUMN approved_at TEXT DEFAULT NULL;

-- ==========================================
-- 3. ADVANCE INTEREST FIELDS
-- ==========================================
ALTER TABLE advance_payments ADD COLUMN interest_rate REAL DEFAULT 0;
ALTER TABLE advance_payments ADD COLUMN interest_amount REAL DEFAULT 0;
ALTER TABLE advance_payments ADD COLUMN total_with_interest REAL DEFAULT 0;
ALTER TABLE advance_payments ADD COLUMN custom_deduction_amount REAL DEFAULT 0;

-- advance_recoveries — add interest portion
ALTER TABLE advance_recoveries ADD COLUMN interest_portion REAL DEFAULT 0;
ALTER TABLE advance_recoveries ADD COLUMN principal_portion REAL DEFAULT 0;

-- ==========================================
-- 4. INTERCOMPANY TRANSFERS
-- ==========================================
CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id TEXT PRIMARY KEY,
  from_company_id TEXT NOT NULL,
  to_company_id TEXT NOT NULL,
  amount REAL NOT NULL,
  transfer_date TEXT NOT NULL,
  payment_method TEXT DEFAULT 'bank',
  reference_no TEXT DEFAULT '',
  description TEXT DEFAULT '',
  transfer_type TEXT DEFAULT 'loan',   -- 'loan', 'repayment', 'investment', 'other'
  status TEXT DEFAULT 'pending',       -- 'pending','approved','rejected','completed'
  approval_status TEXT DEFAULT 'pending',
  approved_by TEXT DEFAULT NULL,
  approved_at TEXT DEFAULT NULL,
  attachment_url TEXT DEFAULT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (from_company_id) REFERENCES companies(id),
  FOREIGN KEY (to_company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ic_from ON intercompany_transfers(from_company_id);
CREATE INDEX IF NOT EXISTS idx_ic_to ON intercompany_transfers(to_company_id);

-- Loan ledger between companies
CREATE TABLE IF NOT EXISTS loan_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,           -- the company that owns this ledger entry
  counterparty_id TEXT DEFAULT NULL,  -- other company (NULL for external parties)
  counterparty_name TEXT DEFAULT '',  -- name if external
  account_type TEXT NOT NULL,         -- 'loan_payable' or 'loan_receivable'
  principal_amount REAL DEFAULT 0,
  interest_rate REAL DEFAULT 0,
  interest_accrued REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  start_date TEXT NOT NULL,
  due_date TEXT DEFAULT NULL,
  status TEXT DEFAULT 'active',       -- 'active','settled','overdue'
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_loan_company ON loan_accounts(company_id, account_type);

-- ==========================================
-- 5. CONTRA ENTRIES
-- ==========================================
CREATE TABLE IF NOT EXISTS contra_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  from_account TEXT NOT NULL,      -- payment method: 'cash','bank','esewa','khalti','cheque','fonepay'
  to_account TEXT NOT NULL,        -- payment method
  amount REAL NOT NULL,
  entry_date TEXT NOT NULL,
  reference_no TEXT DEFAULT '',
  description TEXT DEFAULT '',
  approval_status TEXT DEFAULT 'pending',
  approved_by TEXT DEFAULT NULL,
  approved_at TEXT DEFAULT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_contra_company ON contra_entries(company_id, entry_date);

-- ==========================================
-- 6. BANK ACCOUNTS TABLE (multiple bank accounts per company)
-- ==========================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  account_name TEXT NOT NULL,      -- e.g. "Laxmi Bank - Main", "NMB Savings", "eSewa Wallet"
  account_number TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  branch TEXT DEFAULT '',
  account_type TEXT DEFAULT 'current', -- 'current','savings','fixed'
  payment_method TEXT DEFAULT 'bank',  -- links to transaction payment methods: 'bank','cash','esewa','khalti','fonepay','cheque'
  opening_balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS idx_bank_company ON bank_accounts(company_id);

-- Bank reconciliation entries
CREATE TABLE IF NOT EXISTS bank_reconciliation (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  reconciliation_date TEXT NOT NULL,
  statement_balance REAL NOT NULL,
  book_balance REAL NOT NULL,
  difference REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',      -- 'draft','in_progress','completed'
  notes TEXT DEFAULT '',
  completed_by TEXT DEFAULT NULL,
  completed_at TEXT DEFAULT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
);

-- Link transactions to specific bank accounts and reconciliation status
ALTER TABLE transactions ADD COLUMN bank_account_id TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN is_reconciled INTEGER DEFAULT 0;

-- ==========================================
-- 7. MODULE PERMISSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS module_permissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,             -- 'income','expense','daily_cash','salary','advance','intercompany','contra','reconciliation','settings','staff'
  can_view INTEGER DEFAULT 1,
  can_add INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_comment INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(company_id, user_id, module)
);
CREATE INDEX IF NOT EXISTS idx_modperm_company ON module_permissions(company_id, user_id);

-- Daily cash: sync with income flag
ALTER TABLE daily_cash_payments ADD COLUMN synced_txn_id TEXT DEFAULT NULL;
