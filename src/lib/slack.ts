import { prisma } from "@/lib/prisma";

/**
 * Resolve the Slack webhook URL for a company.
 * Falls back to the global SLACK_WEBHOOK_URL env variable.
 */
export async function getSlackWebhookForCompany(
  companyId: string
): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ slack_webhook_url: string | null }>
    >(`SELECT slack_webhook_url FROM companies WHERE id = ? LIMIT 1`, companyId);
    const url = rows?.[0]?.slack_webhook_url;
    if (url && url.trim().length > 0) return url;
  } catch {}
  return process.env.SLACK_WEBHOOK_URL || null;
}

/**
 * Post a plain text message to a Slack incoming webhook.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function postSlackMessage(
  webhookUrl: string,
  text: string,
  blocks?: any[]
): Promise<void> {
  try {
    const body: any = { text };
    if (blocks) body.blocks = blocks;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("Slack webhook failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Slack webhook error:", err);
  }
}

/**
 * Send a Slack message scoped to a company. Resolves the webhook URL,
 * skips silently if neither company nor global webhook is set.
 */
export async function notifySlack(
  companyId: string,
  text: string,
  blocks?: any[]
): Promise<void> {
  const url = await getSlackWebhookForCompany(companyId);
  if (!url) return;
  await postSlackMessage(url, text, blocks);
}
