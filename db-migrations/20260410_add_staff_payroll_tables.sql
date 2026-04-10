-- =============================================
-- Staff, Salary, Advance & Daily Cash Tables
-- Run: sqlite3 prisma/dev.db < db-migrations/20260410_add_staff_payroll_tables.sql
-- =============================================

-- 1. Staff / Riders table
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'rider',        -- rider, office_staff, manager, driver, helper
  designation TEXT,                           -- custom title
  salary_amount REAL NOT NULL DEFAULT 0,     -- monthly agreed salary
  join_date TEXT,                             -- YYYY-MM-DD
  is_active INTEGER NOT NULL DEFAULT 1,
  bank_account TEXT,                          -- bank account number for salary
  bank_name TEXT,
  emergency_contact TEXT,
  address TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_company ON staff(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(company_id, is_active);

-- 2. Salary Payments table
CREATE TABLE IF NOT EXISTS salary_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  month TEXT NOT NULL,                        -- YYYY-MM (e.g. 2026-04)
  payment_date TEXT NOT NULL,                 -- YYYY-MM-DD
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash, bank, esewa, khalti, cheque
  reference_no TEXT,
  deductions REAL DEFAULT 0,                  -- tax, TDS, etc
  bonus REAL DEFAULT 0,
  net_amount REAL NOT NULL,                   -- amount - deductions + bonus
  status TEXT NOT NULL DEFAULT 'paid',        -- paid, pending, partial
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_salary_company ON salary_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_salary_staff ON salary_payments(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_payments(company_id, month);

-- 3. Advance Payments table (auto-set as due/receivable)
CREATE TABLE IF NOT EXISTS advance_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,                 -- YYYY-MM-DD
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_no TEXT,
  reason TEXT,
  due_amount REAL NOT NULL,                   -- remaining amount to recover (starts = amount)
  status TEXT NOT NULL DEFAULT 'due',         -- due, partially_recovered, recovered
  recovery_deadline TEXT,                     -- YYYY-MM-DD optional deadline
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_advance_company ON advance_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_advance_staff ON advance_payments(staff_id);
CREATE INDEX IF NOT EXISTS idx_advance_status ON advance_payments(company_id, status);

-- 4. Advance Recovery log (tracks each deduction from salary or cash repayment)
CREATE TABLE IF NOT EXISTS advance_recoveries (
  id TEXT PRIMARY KEY,
  advance_id TEXT NOT NULL REFERENCES advance_payments(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  recovery_date TEXT NOT NULL,                -- YYYY-MM-DD
  recovery_method TEXT NOT NULL DEFAULT 'salary_deduction', -- salary_deduction, cash_return, bank_return
  salary_payment_id TEXT REFERENCES salary_payments(id),     -- if deducted from salary
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recovery_advance ON advance_recoveries(advance_id);

-- 5. Daily Cash Payments table
CREATE TABLE IF NOT EXISTS daily_cash_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES staff(id),         -- optional: could be general cash expense
  date TEXT NOT NULL,                          -- YYYY-MM-DD
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',    -- fuel, food, transport, maintenance, general, tips, loading
  description TEXT,
  receipt_no TEXT,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'approved',     -- approved, pending, rejected
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_cash_company ON daily_cash_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_daily_cash_date ON daily_cash_payments(company_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_cash_staff ON daily_cash_payments(staff_id);
