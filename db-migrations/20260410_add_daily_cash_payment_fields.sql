-- Add payment_method and fonepay_ref columns to daily_cash_payments
-- These support Cash Collection and Fonepay payment methods

ALTER TABLE daily_cash_payments ADD COLUMN payment_method TEXT DEFAULT 'cash';
ALTER TABLE daily_cash_payments ADD COLUMN fonepay_ref TEXT DEFAULT '';
