# Packrs Courier DMS — Daily Slack Reporter

Automated daily Slack reports from the Packrs Courier DMS system. Scrapes dashboard stats, today's packages, and delivery assignments, then posts a formatted Block Kit report to Slack at 7 PM NPT.

## What the Report Includes

1. **Today's Orders** — total count, inside valley vs. outside valley
2. **Status Breakdown** — Warehouse, Ready to Pick, Pick Up, Receive, In Transit, Ready to Deliver, Delivered
3. **Live Dashboard** — system-wide counts from the DMS dashboard
4. **Inside Valley Riders** — each rider's parcels sorted by most pending, with package ID, vendor, customer, address, amount, status
5. **Outside Valley Couriers** — each courier's total parcel count and full package details

---

## Quick Start

### 1. Clone and install

```bash
cd slack_reporter
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### 3. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**
2. Name it (e.g. "Packrs Reporter") and select your workspace
3. Go to **OAuth & Permissions** → add these Bot Token Scopes:
   - `chat:write`
   - `chat:write.public` (if posting to channels the bot hasn't joined)
4. Click **Install to Workspace** and authorize
5. Copy the **Bot User OAuth Token** (`xoxb-...`) into your `.env`
6. Invite the bot to your target channel: `/invite @Packrs Reporter`

### 4. Test run

```bash
python main.py --now
```

### 5. Start the scheduler

```bash
python main.py
```

The report fires daily at 19:00 NPT (configurable via `REPORT_HOUR` / `REPORT_MINUTE` in `.env`).

---

## Running as a systemd Service

Create `/etc/systemd/system/packrs-reporter.service`:

```ini
[Unit]
Description=Packrs Courier DMS Slack Reporter
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/slack_reporter
ExecStart=/opt/slack_reporter/venv/bin/python main.py
Restart=on-failure
RestartSec=30
EnvironmentFile=/opt/slack_reporter/.env

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now packrs-reporter
sudo journalctl -u packrs-reporter -f   # watch logs
```

---

## Running with Docker

### Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

### Build and run

```bash
docker build -t packrs-reporter .
docker run -d --name packrs-reporter --env-file .env --restart unless-stopped packrs-reporter
```

### Docker Compose

```yaml
version: "3.8"
services:
  reporter:
    build: .
    env_file: .env
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## Project Structure

```
slack_reporter/
├── .env.example        # Config template
├── main.py             # Entry point + APScheduler
├── scraper.py          # DMS login + data extraction
├── report_builder.py   # Slack Block Kit message builder
├── slack_sender.py     # Slack Web API sender
├── requirements.txt    # Python dependencies
└── README.md           # This file
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Login fails | Verify DMS_USERNAME / DMS_PASSWORD in .env. Check if the DMS login page structure changed. |
| Slack error `not_in_channel` | Invite the bot to the channel: `/invite @YourBotName` |
| Slack error `invalid_auth` | Regenerate the Bot Token in the Slack app dashboard |
| Empty report | Check if there are actually packages created today in DMS. Try `python main.py --now` and check logs. |
| Missing dashboard stats | The dashboard HTML structure may have changed. Update the selectors in `scraper.py`. |
