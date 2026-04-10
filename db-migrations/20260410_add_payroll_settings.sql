-- Payroll Settings table for custom salary deduction fields and daily cash categories
-- Run: sqlite3 prisma/dev.db < db-migrations/20260410_add_payroll_settings.sql

CREATE TABLE IF NOT EXISTS payroll_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  setting_type TEXT NOT NULL,        -- salary_deduction, salary_bonus, daily_cash_category
  field_name TEXT NOT NULL,           -- machine-readable key e.g. 'tds', 'pf'
  field_label TEXT NOT NULL,          -- display label e.g. 'TDS', 'Provident Fund'
  field_type TEXT NOT NULL DEFAULT 'number',  -- number, text, percentage
  default_value TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payroll_settings_company ON payroll_settings(company_id, setting_type);
