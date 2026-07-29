import { Router } from "express";
import crypto from "node:crypto";
import { requireDashboardToken } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { getSmsMessage, insertInboundSms, listSmsMessages, recordSmsSent } from "../lib/db.js";
import { isTwilioConfigured, sendSms } from "../lib/sms.js";
import { logger } from "../lib/logger.js";

export const smsRouter = Router();
smsRouter.use(requireDashboardToken);

smsRouter.get("/", async (_req, res) => {
  const messages = await listSmsMessages();
  res.status(200).json({ messages });
});

/**
 * The founder's authenticated dashboard session IS the approval step —
 * the only path that actually sends a text. Wordsmith only ever drafts
 * (PATCH /api/agents/sms/:id/draft).
 */
smsRouter.post("/:id/send", async (req, res) => {
  const message = await getSmsMessage(req.params.id);
  if (!message) {
    res.status(404).json({ error: "message_not_found" });
    return;
  }
  if (!message.drafted_reply) {
    res.status(400).json({ error: "no_draft", message: "This text has no drafted reply yet." });
    return;
  }

  try {
    const result = await sendSms({ to: message.phone, body: message.drafted_reply });
    await recordSmsSent(message.id, { phone: message.phone, body: message.drafted_reply, twilioSid: result.twilioSid });
    res.status(200).json({ mock: result.mock });
  } catch (err) {
    logger.error({ err, messageId: message.id }, "failed to send SMS reply");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Verifies Twilio's X-Twilio-Signature header per Twilio's documented
 * algorithm: HMAC-SHA1 of (webhook URL + sorted POST param key/value
 * pairs concatenated), keyed with the auth token, base64-encoded, and
 * compared with a timing-safe check. Only enforced once TWILIO_AUTH_TOKEN
 * is actually set — mock mode has no real Twilio account sending
 * signed requests in the first place.
 */
function isValidTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined): boolean {
  if (!isTwilioConfigured) return true; // nothing to verify against in mock mode
  if (!signature) return false;

  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac("sha1", env.TWILIO_AUTH_TOKEN!).update(data, "utf-8").digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Public webhook Twilio calls directly when a text arrives at the
 * business's number. Not behind requireDashboardToken (Twilio can't
 * present it) — protected instead by signature verification above.
 * Mounted separately in app.ts, outside the dashboard-token-gated router.
 */
export const smsWebhookRouter = Router();

smsWebhookRouter.post("/", async (req, res) => {
  const signature = req.headers["x-twilio-signature"];
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  if (!isValidTwilioSignature(fullUrl, req.body, typeof signature === "string" ? signature : undefined)) {
    logger.warn("rejected SMS webhook with invalid Twilio signature");
    res.status(403).send("Invalid signature");
    return;
  }

  const from = req.body.From;
  const body = req.body.Body;
  const twilioSid = req.body.MessageSid;

  if (typeof from === "string" && typeof body === "string" && typeof twilioSid === "string") {
    await insertInboundSms({ phone: from, body, twilioSid });
    logger.info({ from }, "inbound SMS received");
  }

  // Empty TwiML response — we reply asynchronously once Wordsmith drafts
  // and the founder approves, not inline in the webhook.
  res.status(200).type("text/xml").send("<Response></Response>");
});
