/**
 * Twilio SMS — the "texts" claim. Runs in mock mode (logs, never dials
 * out) until all three TWILIO_* credentials are set — same pattern as
 * every other integration here. Sending is only ever called from the
 * founder-gated route in routes/sms.ts.
 */
import { env } from "./env.js";
import { logger } from "./logger.js";

export const isTwilioConfigured = Boolean(
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
);

export interface SendSmsResult {
  mock: boolean;
  twilioSid: string | null;
}

export async function sendSms(input: { to: string; body: string }): Promise<SendSmsResult> {
  if (!isTwilioConfigured) {
    logger.info({ to: input.to }, "[mock sms] would send text — not actually delivered");
    return { mock: true, twilioSid: null };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const basicAuth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: input.to, From: env.TWILIO_FROM_NUMBER!, Body: input.body }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Twilio send failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { sid: string };
  return { mock: false, twilioSid: data.sid };
}
