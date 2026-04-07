"""
slack_sender.py — Sends Slack messages via webhook AND uploads PDF files
via the Slack Web API (files.upload v2).

Two modes:
  1. Webhook — for Block Kit summary messages (no auth token needed)
  2. Bot Token — for uploading PDF files (requires SLACK_BOT_TOKEN + channel ID)

If no bot token is configured, the PDF is skipped and only the webhook
summary is sent.
"""

import logging
import os
import requests

logger = logging.getLogger(__name__)


class SlackSender:
    """Posts Block Kit messages and uploads files to Slack."""

    def __init__(self, webhook_url: str, bot_token: str = None, channel_id: str = None):
        """
        Args:
            webhook_url: Slack Incoming Webhook URL
            bot_token:   Slack Bot OAuth Token (xoxb-...) for file uploads
            channel_id:  Slack channel ID (e.g. C07XXXXXXXX) for file uploads
        """
        self.webhook_url = webhook_url
        self.bot_token = bot_token
        self.channel_id = channel_id

    def send_webhook(self, blocks: list[dict], text: str = "Packrs Courier Daily Report") -> dict:
        """Post a Block Kit message via webhook."""
        payload = {"text": text, "blocks": blocks}
        logger.info("Sending summary to Slack via webhook...")
        resp = requests.post(self.webhook_url, json=payload, timeout=30)

        if resp.status_code != 200 or resp.text != "ok":
            logger.error("Slack webhook error: %s %s", resp.status_code, resp.text)
            raise RuntimeError(f"Slack webhook error: {resp.status_code} — {resp.text}")

        logger.info("Webhook message sent successfully.")
        return {"ok": True}

    def upload_file(self, file_path: str, title: str = None,
                    initial_comment: str = None) -> dict:
        """
        Upload a file to Slack using the files.upload API.
        Requires bot_token and channel_id to be set.

        Args:
            file_path:       Path to the file to upload
            title:           Title for the file in Slack
            initial_comment: Comment to post with the file

        Returns:
            Slack API response dict.
        """
        if not self.bot_token:
            logger.warning("No SLACK_BOT_TOKEN configured — skipping PDF upload.")
            logger.info("To enable PDF uploads, add SLACK_BOT_TOKEN and SLACK_CHANNEL_ID to .env")
            return {"ok": False, "error": "no_bot_token"}

        if not self.channel_id:
            logger.warning("No SLACK_CHANNEL_ID configured — skipping PDF upload.")
            return {"ok": False, "error": "no_channel_id"}

        filename = os.path.basename(file_path)
        title = title or filename

        logger.info("Uploading %s to Slack channel %s...", filename, self.channel_id)

        # Use files.upload API
        resp = requests.post(
            "https://slack.com/api/files.upload",
            headers={"Authorization": f"Bearer {self.bot_token}"},
            data={
                "channels": self.channel_id,
                "title": title,
                "initial_comment": initial_comment or "",
                "filename": filename,
            },
            files={"file": (filename, open(file_path, "rb"), "application/pdf")},
            timeout=60,
        )

        result = resp.json()
        if not result.get("ok"):
            logger.error("Slack file upload error: %s", result.get("error", "unknown"))
            raise RuntimeError(f"Slack file upload failed: {result.get('error', 'unknown')}")

        logger.info("PDF uploaded successfully to Slack.")
        return result

    def send_report(self, blocks: list[dict], pdf_path: str = None,
                    text: str = "Packrs Courier Daily Report") -> dict:
        """
        Send the full report: webhook summary + PDF upload.

        Args:
            blocks:   Slack Block Kit blocks for the summary message
            pdf_path: Path to the PDF file to upload (optional)
            text:     Fallback text for the webhook message

        Returns:
            Dict with results of both operations.
        """
        results = {}

        # 1. Send webhook summary (always)
        try:
            results["webhook"] = self.send_webhook(blocks, text)
        except Exception as e:
            logger.error("Webhook send failed: %s", e)
            results["webhook"] = {"ok": False, "error": str(e)}

        # 2. Upload PDF if path provided and bot token available
        if pdf_path and os.path.exists(pdf_path):
            try:
                from datetime import datetime
                import pytz
                npt = pytz.timezone("Asia/Kathmandu")
                now = datetime.now(npt)
                date_str = now.strftime("%Y-%m-%d")

                results["pdf_upload"] = self.upload_file(
                    file_path=pdf_path,
                    title=f"Packrs Courier Report - {date_str}.pdf",
                    initial_comment=f"📊 Full detailed report for {date_str}",
                )
            except Exception as e:
                logger.error("PDF upload failed: %s", e)
                results["pdf_upload"] = {"ok": False, "error": str(e)}
        elif pdf_path:
            logger.warning("PDF file not found: %s", pdf_path)
            results["pdf_upload"] = {"ok": False, "error": "file_not_found"}

        return results

    def send_chunked(self, blocks: list[dict],
                     text: str = "Packrs Courier Daily Report") -> list[dict]:
        """Split blocks into chunks of 50 and send via webhook."""
        MAX_BLOCKS = 50
        if len(blocks) <= MAX_BLOCKS:
            return [self.send_webhook(blocks, text)]

        responses = []
        for i in range(0, len(blocks), MAX_BLOCKS):
            chunk = blocks[i:i + MAX_BLOCKS]
            part_num = (i // MAX_BLOCKS) + 1
            responses.append(self.send_webhook(chunk, f"{text} (Part {part_num})"))
        return responses
