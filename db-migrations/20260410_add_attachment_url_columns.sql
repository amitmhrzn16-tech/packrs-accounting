-- Add attachment_url columns to daily_cash_payments, advance_payments, salary_payments
-- Run: sqlite3 prisma/dev.db < db-migrations/20260410_add_attachment_url_columns.sql

ALTER TABLE daily_cash_payments ADD COLUMN attachment_url TEXT DEFAULT NULL;
ALTER TABLE advance_payments ADD COLUMN attachment_url TEXT DEFAULT NULL;
ALTER TABLE salary_payments ADD COLUMN attachment_url TEXT DEFAULT NULL;
