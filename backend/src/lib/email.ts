/**
 * Founder notification email. Runs in mock mode (logs only) until
 * RESEND_API_KEY is set — same pattern as lib/payments.ts and lib/vapi.ts,
 * so nothing here blocks running the site today. Fire-and-forget from
 * callers: a notification failing should never fail the request that
 * triggered it (see routes/waitlist.ts).
 */
import { env } from "./env.js";
import { logger } from "./logger.js";

export async function notifyFounder(subject: string, body: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info({ to: env.FOUNDER_NOTIFICATION_EMAIL, subject }, `[mock email] ${subject}\n${body}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Autonoma <notifications@autonoma.dev>",
      to: [env.FOUNDER_NOTIFICATION_EMAIL],
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Resend send failed: ${response.status} ${errBody}`);
  }
}

export function notifyNewWaitlistLead(lead: {
  email: string;
  businessName: string;
  tierInterest: string;
  timeSink: string;
}): Promise<void> {
  const subject = `New waitlist signup: ${lead.businessName}`;
  const body = [
    `Business: ${lead.businessName}`,
    `Email: ${lead.email}`,
    `Tier interest: ${lead.tierInterest}`,
    `Time sink: ${lead.timeSink}`,
    "",
    "View in dashboard: (see /dashboard)",
  ].join("\n");

  return notifyFounder(subject, body).catch((err) => {
    logger.error({ err, email: lead.email }, "failed to send waitlist notification email");
  });
}
