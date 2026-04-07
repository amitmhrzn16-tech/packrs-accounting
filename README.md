# Packrs Courier Accounting System

A modern, multi-company accounting and reconciliation platform built for Packrs Courier. It handles day-to-day income & expense tracking, bank statement reconciliation, cash reconciliation, DMS integration, role-based team access, in-app chat, and comment threads on every entry.

## Features

### Core accounting
- Multi-company workspace with isolated data per company
- Income and expense tracking with categories, payment methods, attachments, and reference numbers
- Bulk delete with confirmation and audit logging
- Per-entry file attachments (PDF / JPG / PNG / WebP)
- Recurring entries and payment-method opening balances
- Fiscal-year-aware reporting and Nepali currency formatting

### Bank reconciliation
- Upload bank statements (XLSX, CSV, PDF) with automatic parsing
- Intelligent transaction matching with confidence scoring
- Cash reconciliation workflow
- Visual reconciliation dashboard

### DMS integration
- Sync income and expense transactions directly from the Packrs DMS web portal
- Per-company DMS credentials and branch configuration
- Manual or scheduled (cron) sync with detailed run logs
- Match / new / skipped status tracking per synced row

### Team collaboration
- **In-app chat** — floating chat widget with direct messages between users and per-company channels, auto-refreshed every few seconds
- **Transaction comments** — per-entry comment threads on every income/expense row with unread badges
- **Notification bell** — top-right bell icon showing new comments from teammates with one-click navigation to the entry
- **User management** — super-admin page for inviting users, assigning roles, and granting per-company access

### Role-based access
- `super_admin` — full access to all companies and user management
- `company_admin` — manage a single company's data and team
- `accountant` — add and edit transactions
- `viewer` — read-only access

### Automation
- Slack reporter (Python) that scrapes DMS data, builds PDF reports, and posts them to Slack on a schedule
- Cron-based DMS sync endpoint for scheduled imports

## Tech stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **ORM:** Prisma
- **Database:** SQLite (development), easily swappable to PostgreSQL/MySQL for production
- **Auth:** NextAuth v5 (JWT strategy, credentials provider, bcrypt password hashing)
- **UI:** Tailwind CSS + shadcn/ui + lucide-react
- **State & data:** React hooks with polling; server components where possible
- **Reporting agent:** Python 3 (requests, BeautifulSoup, ReportLab, slack-sdk)

## Getting started

### Prerequisites
- Node.js 18+
- npm or pnpm
- Python 3.10+ (only if you want to run the Slack reporter)

### Installation

```bash
git clone https://github.com/amitmhrzn16-tech/packrs-accounting.git
cd packrs-accounting
npm install
```

### Environment

Copy `.env.example` to `.env` and fill in:

```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"
NEXTAUTH_URL="http://localhost:3000"
```

### Database

```bash
npx prisma generate
npx prisma db push
```

This creates the SQLite database and all tables (users, companies, transactions, chat_messages, transaction_comments, DMS tables, etc.).

### Seed a super admin

Use the registration page `/register` or insert a user directly with a bcrypt-hashed password (see `scripts/` or run `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 12))"`).

### Run the dev server

```bash
npm run dev
```

The app is now available at [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

## Project structure

```
src/
├── app/
│   ├── (auth)/              # login / register pages
│   ├── api/
│   │   ├── auth/            # NextAuth endpoints
│   │   ├── chat/            # DM + channel endpoints
│   │   ├── companies/       # company CRUD + per-company sub-routes
│   │   ├── cron/            # scheduled DMS sync
│   │   ├── notifications/   # comment notifications
│   │   ├── transactions/    # comments + bulk helpers
│   │   └── users/           # user management + per-user companies
│   └── dashboard/
│       ├── companies/[companyId]/
│       │   ├── income/
│       │   ├── expenses/
│       │   ├── transactions/
│       │   ├── reconciliation/
│       │   ├── cash-reconciliation/
│       │   ├── dms-sync/
│       │   ├── reports/
│       │   └── settings/
│       ├── users/           # super-admin user management
│       └── layout.tsx       # mounts ChatWidget + NotificationBell
├── components/
│   ├── ChatWidget.tsx       # floating chat (DMs + channels)
│   ├── CommentThread.tsx    # per-transaction comment popover
│   ├── NotificationBell.tsx # top-right notification bell
│   ├── dashboard/           # sidebar, main content, company cards
│   └── ui/                  # shadcn/ui primitives
├── lib/
│   ├── auth.ts              # NextAuth config
│   ├── prisma.ts            # Prisma client singleton
│   ├── dms/                 # DMS client, sync, and DB helpers
│   ├── parsers/             # bank statement parsers
│   └── reconciliation/      # transaction matching engine
└── hooks/

prisma/
└── schema.prisma            # all models

slack_reporter/
├── main.py                  # orchestrator
├── scraper.py               # DMS scraper
├── report_builder.py        # PDF generator
└── slack_sender.py          # posts to Slack
```

## Key API endpoints

### Chat
- `GET /api/chat/conversations` — list users and accessible channels
- `GET|POST /api/chat/dm/[userId]` — direct message history / send
- `GET|POST /api/chat/channel/[companyId]` — channel history / send

### Comments
- `GET|POST /api/transactions/[transactionId]/comments` — thread per entry
- `POST /api/transactions/comment-counts` — bulk badge counts

### Notifications
- `GET /api/notifications/comments?since=ISO` — recent comments from other users

### Companies / users / transactions
- `GET /api/companies?all=true` — super-admin override to see all companies
- `GET|POST|PATCH|DELETE /api/users[/userId]` — user management
- `GET|POST /api/users/[userId]/companies` — per-user company access
- Standard CRUD under `/api/companies/[companyId]/...`

## Security

- Passwords hashed with bcrypt (cost factor 12)
- JWT sessions, httpOnly cookies
- Role checks on every mutating route
- Per-company access enforced at the API layer
- Audit log for destructive operations

## License

Proprietary — © Packrs Courier. All rights reserved.
