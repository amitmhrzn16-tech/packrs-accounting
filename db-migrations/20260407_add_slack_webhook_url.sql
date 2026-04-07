-- Add Slack webhook URL column to companies for per-company Slack notifications.
-- Apply manually if you can't run `prisma db push`:
--   sqlite3 prisma/dev.db < db-migrations/20260407_add_slack_webhook_url.sql

ALTER TABLE companies ADD COLUMN slack_webhook_url TEXT;
