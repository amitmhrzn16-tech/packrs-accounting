"""
main.py — Entry point for Packrs Courier DMS Slack Reporter.

Uses APScheduler to fire run_report() every 2 hours.
Supports --now flag for an immediate test run.
Loads configuration from .env via python-dotenv.
On first run, interactively prompts for all credentials and saves to .env.
"""

import argparse
import getpass
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from apscheduler.schedulers.blocking import BlockingScheduler
import pytz

from scraper import DMSScraper
from report_builder import build_pdf, build_slack_summary
from slack_sender import SlackSender

# ── Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("packrs_reporter")

NPT = pytz.timezone("Asia/Kathmandu")
ENV_PATH = Path(__file__).parent / ".env"

# ── Config keys with prompts and defaults ─────────────────────────
CONFIG_FIELDS = [
    {
        "key": "DMS_BASE_URL",
        "prompt": "DMS Base URL",
        "default": "https://dms.packrscourier.com.np/dmsadmin",
        "secret": False,
        "group": "dms",
    },
    {
        "key": "DMS_USERNAME",
        "prompt": "DMS Username (email)",
        "default": "",
        "secret": False,
        "group": "dms",
    },
    {
        "key": "DMS_PASSWORD",
        "prompt": "DMS Password",
        "default": "",
        "secret": True,
        "group": "dms",
    },
    {
        "key": "SLACK_WEBHOOK_URL",
        "prompt": "Slack Webhook URL (https://hooks.slack.com/services/...)",
        "default": "",
        "secret": True,
        "group": "slack",
    },
    {
        "key": "SLACK_BOT_TOKEN",
        "prompt": "Slack Bot Token (xoxb-... for PDF upload, leave blank to skip)",
        "default": "",
        "secret": True,
        "group": "slack",
    },
    {
        "key": "SLACK_CHANNEL_ID",
        "prompt": "Slack Channel ID (e.g. C07XXXXXXXX, for PDF upload)",
        "default": "",
        "secret": False,
        "group": "slack",
    },
    {
        "key": "REPORT_INTERVAL_HOURS",
        "prompt": "Report interval in hours",
        "default": "2",
        "secret": False,
        "group": "schedule",
    },
]


def interactive_setup() -> dict:
    """
    Prompt the user for all configuration values interactively.
    Saves the result to .env and returns the config dict.
    """
    print()
    print("=" * 60)
    print("  Packrs Courier DMS — Slack Reporter Setup")
    print("=" * 60)
    print()

    config = {}

    # ── DMS Credentials ──────────────────────────────────────────
    print("── Step 1: Packrs DMS Login ────────────────────────────")
    print("  (Login for https://dms.packrscourier.com.np/dmsadmin)")
    print()

    for field in CONFIG_FIELDS:
        if field["group"] != "dms":
            continue
        default_hint = f" [{field['default']}]" if field["default"] else ""
        if field["secret"]:
            value = getpass.getpass(f"  {field['prompt']}{default_hint}: ")
        else:
            value = input(f"  {field['prompt']}{default_hint}: ")
        config[field["key"]] = value.strip() or field["default"]

    # ── Slack Webhook ────────────────────────────────────────────
    print()
    print("── Step 2: Slack Configuration ─────────────────────────")
    print("  Webhook URL is required for summary messages.")
    print("  Bot Token + Channel ID are optional (for PDF upload).")
    print()
    print("  To get a bot token:")
    print("  1. Go to https://api.slack.com/apps → Your App")
    print("  2. OAuth & Permissions → Bot Token Scopes → add 'files:write'")
    print("  3. Install to Workspace → Copy Bot User OAuth Token")
    print()

    for field in CONFIG_FIELDS:
        if field["group"] != "slack":
            continue
        default_hint = f" [{field['default']}]" if field["default"] else ""
        if field["secret"]:
            value = getpass.getpass(f"  {field['prompt']}{default_hint}: ")
        else:
            value = input(f"  {field['prompt']}{default_hint}: ")
        config[field["key"]] = value.strip() or field["default"]

    # ── Schedule ─────────────────────────────────────────────────
    print()
    print("── Step 3: Report Schedule ────────────────────────────")
    print()

    for field in CONFIG_FIELDS:
        if field["group"] != "schedule":
            continue
        default_hint = f" [{field['default']}]" if field["default"] else ""
        value = input(f"  {field['prompt']}{default_hint}: ")
        config[field["key"]] = value.strip() or field["default"]

    # ── Save to .env ─────────────────────────────────────────────
    print()
    print("Saving configuration to .env ...")

    lines = [
        "# ── Packrs Courier DMS Credentials ─────────────────────────────",
        f"DMS_BASE_URL={config['DMS_BASE_URL']}",
        f"DMS_USERNAME={config['DMS_USERNAME']}",
        f"DMS_PASSWORD={config['DMS_PASSWORD']}",
        "",
        "# ── Slack Configuration ─────────────────────────────────────────",
        f"SLACK_WEBHOOK_URL={config['SLACK_WEBHOOK_URL']}",
        f"SLACK_BOT_TOKEN={config.get('SLACK_BOT_TOKEN', '')}",
        f"SLACK_CHANNEL_ID={config.get('SLACK_CHANNEL_ID', '')}",
        "",
        "# ── Schedule ────────────────────────────────────────────────────",
        f"REPORT_INTERVAL_HOURS={config['REPORT_INTERVAL_HOURS']}",
        "",
    ]

    ENV_PATH.write_text("\n".join(lines))

    print(f"  Saved to {ENV_PATH}")
    print()
    print("=" * 60)
    print("  Setup complete! You can edit .env anytime to update.")
    print("=" * 60)
    print()

    return config


def get_config() -> dict:
    """
    Load config from .env. If .env doesn't exist or has missing values,
    run interactive setup first.
    """
    if not ENV_PATH.exists() or ENV_PATH.stat().st_size < 10:
        interactive_setup()

    load_dotenv(ENV_PATH, override=True)

    required = {
        "DMS_BASE_URL": os.getenv("DMS_BASE_URL", "https://dms.packrscourier.com.np/dmsadmin"),
        "DMS_USERNAME": os.getenv("DMS_USERNAME"),
        "DMS_PASSWORD": os.getenv("DMS_PASSWORD"),
        "SLACK_WEBHOOK_URL": os.getenv("SLACK_WEBHOOK_URL"),
    }

    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"\nMissing values in .env: {', '.join(missing)}")
        print("Let's fill in the missing fields.\n")
        interactive_setup()
        load_dotenv(ENV_PATH, override=True)
        required = {
            "DMS_BASE_URL": os.getenv("DMS_BASE_URL", "https://dms.packrscourier.com.np/dmsadmin"),
            "DMS_USERNAME": os.getenv("DMS_USERNAME"),
            "DMS_PASSWORD": os.getenv("DMS_PASSWORD"),
            "SLACK_WEBHOOK_URL": os.getenv("SLACK_WEBHOOK_URL"),
        }

    still_missing = [k for k, v in required.items() if not v]
    if still_missing:
        logger.error("Still missing required config: %s", ", ".join(still_missing))
        logger.error("Please edit .env manually and try again.")
        sys.exit(1)

    return {
        **required,
        "SLACK_BOT_TOKEN": os.getenv("SLACK_BOT_TOKEN", ""),
        "SLACK_CHANNEL_ID": os.getenv("SLACK_CHANNEL_ID", ""),
        "REPORT_INTERVAL_HOURS": int(os.getenv("REPORT_INTERVAL_HOURS", "2")),
    }


def run_report():
    """Execute the full scrape → build PDF → send pipeline."""
    logger.info("=" * 60)
    logger.info("Starting report run...")

    cfg = get_config()

    try:
        # 1. Scrape DMS
        scraper = DMSScraper(
            base_url=cfg["DMS_BASE_URL"],
            username=cfg["DMS_USERNAME"],
            password=cfg["DMS_PASSWORD"],
        )
        data = scraper.collect_full_report_data()
        logger.info(
            "Scraped: %d packages today (%d IV, %d OV), "
            "%d warehouse, %d deliveries, %d invoices",
            len(data["all_packages_today"]),
            len(data["inside_valley_today"]),
            len(data["outside_valley_today"]),
            data["warehouse"]["total_packages"],
            data["deliveries"]["total_packages"],
            data["invoices"]["total_invoices"],
        )

        # 2. Build PDF report — save in project directory too
        report_dir = Path(__file__).parent / "reports"
        report_dir.mkdir(exist_ok=True)
        from datetime import datetime as dt
        now = dt.now(pytz.timezone("Asia/Kathmandu"))
        pdf_filename = f"packrs_report_{now.strftime('%Y-%m-%d_%H%M')}.pdf"
        pdf_path = str(report_dir / pdf_filename)
        build_pdf(data, output_path=pdf_path)
        logger.info("PDF report saved: %s", pdf_path)

        # 3. Build Slack summary blocks
        blocks = build_slack_summary(data)
        logger.info("Built Slack summary with %d blocks", len(blocks))

        # 4. Send to Slack (webhook summary + PDF upload if bot token present)
        sender = SlackSender(
            webhook_url=cfg["SLACK_WEBHOOK_URL"],
            bot_token=cfg.get("SLACK_BOT_TOKEN"),
            channel_id=cfg.get("SLACK_CHANNEL_ID"),
        )
        results = sender.send_report(blocks, pdf_path=pdf_path)

        webhook_ok = results.get("webhook", {}).get("ok", False)
        pdf_ok = results.get("pdf_upload", {}).get("ok", False)
        logger.info(
            "Report sent — Webhook: %s | PDF upload: %s",
            "OK" if webhook_ok else "FAILED",
            "OK" if pdf_ok else ("skipped (no bot token)" if not cfg.get("SLACK_BOT_TOKEN") else "FAILED"),
        )

    except Exception:
        logger.exception("Report run failed!")

    logger.info("Report run complete.")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Packrs Courier DMS → Slack Reporter (PDF + Summary)"
    )
    parser.add_argument(
        "--now",
        action="store_true",
        help="Run the report immediately and exit (skip scheduler)",
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Force re-run the interactive setup (overwrites .env)",
    )
    args = parser.parse_args()

    # Force setup if requested
    if args.setup:
        interactive_setup()
        load_dotenv(ENV_PATH, override=True)

    cfg = get_config()

    if args.now:
        logger.info("Running report immediately (--now flag)...")
        run_report()
        return

    # Schedule every 2 hours
    interval = cfg["REPORT_INTERVAL_HOURS"]
    logger.info("Scheduling report every %d hour(s) (Asia/Kathmandu)", interval)

    scheduler = BlockingScheduler(timezone=NPT)
    scheduler.add_job(
        run_report,
        trigger="interval",
        hours=interval,
        id="periodic_report",
        name=f"Packrs Report (every {interval}h)",
        misfire_grace_time=3600,
    )

    # Also run immediately on start
    logger.info("Running initial report now...")
    try:
        run_report()
    except Exception:
        logger.exception("Initial report failed, but scheduler will continue.")

    try:
        logger.info("Scheduler started. Press Ctrl+C to stop.")
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    main()
