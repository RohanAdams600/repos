import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Founder escalation channel. In manual/supervised trust stages this is
 * how a sub-agent surfaces a blocked task; in autonomous stage it's how
 * the heartbeat loop reports guarantee-SLA breaches and boundary hits.
 */
export async function alertFounder(message: string): Promise<void> {
  logger.warn({ channel: env.HEARTBEAT_ALERT_CHANNEL }, `FOUNDER ALERT: ${message}`);

  if (!env.SLACK_ALERT_WEBHOOK_URL) return;

  try {
    await fetch(env.SLACK_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: ${message}` }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to deliver Slack alert");
  }
}
