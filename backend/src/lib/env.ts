import "dotenv/config";
import { z } from "zod";

const REQUIRED_IN_LIVE_MODE = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_DEPOSIT",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_CORE_MONTHLY",
  "STRIPE_PRICE_SCALE_MONTHLY",
] as const;

// Exported so tests can validate the schema's rules (e.g. the live-mode
// Stripe requirement below) without touching process.env or fighting
// ESM module-caching to re-import this file with different values.
export const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.string().min(1).default("http://localhost:3000"),

    // 'mock' (default) needs zero Stripe setup: checkout routes complete the
    // relevant DB write synchronously and redirect straight to the success
    // page, so the whole funnel is demoable before Stripe is wired up. Flip
    // to 'live' once real keys/prices exist — see README "Going live with
    // Stripe" for the switchover checklist.
    PAYMENTS_MODE: z.enum(["mock", "live"]).default("mock"),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_DEPOSIT: z.string().optional(),
    STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
    STRIPE_PRICE_CORE_MONTHLY: z.string().optional(),
    STRIPE_PRICE_SCALE_MONTHLY: z.string().optional(),

    CHECKOUT_SUCCESS_URL: z.string().url().default("http://localhost:3000/waitlist/success"),
    CHECKOUT_CANCEL_URL: z.string().url().default("http://localhost:3000/waitlist"),

    AGENTS_SERVICE_TOKEN: z.string().min(1),
    DASHBOARD_TOKEN: z.string().min(1),

    // --- Vapi (voice AI) ---
    // Optional: without VAPI_PRIVATE_API_KEY, cold-call triggers run in
    // mock mode (logged, never dialed) — see lib/vapi.ts. The two
    // assistant IDs are a hard allowlist: lib/vapi.ts refuses to touch
    // any assistant ID other than these two, no matter what a caller
    // passes in. Defaults below are the IDs given at setup time — verify
    // they're assigned to the right assistant in your Vapi dashboard.
    VAPI_PRIVATE_API_KEY: z.string().optional(),
    VAPI_ASSISTANT_ID_COLD_CALL: z.string().default("477be865-42ea-4b34-bc1c-3e7072ab2b5c"),
    VAPI_ASSISTANT_ID_WEBSITE_DEMO: z.string().default("7b531751-6325-4faf-8c38-03b1186a7ed8"),
    // A Vapi phoneNumberId (UUID) is what the outbound call API actually
    // needs as the "from" number — set this once a number is imported
    // into Vapi. FOUNDER_PHONE_NUMBER below is kept separately since it
    // looked like a raw phone number, not a Vapi resource id.
    VAPI_PHONE_NUMBER_ID: z.string().optional(),
    FOUNDER_PHONE_NUMBER: z.string().default("4694006197"),

    // --- Email notifications (founder alerts, via Resend) ---
    // Optional: without RESEND_API_KEY, signup notifications are logged
    // instead of emailed — see lib/email.ts.
    RESEND_API_KEY: z.string().optional(),
    FOUNDER_NOTIFICATION_EMAIL: z.string().email().default("rohanadams352@gmail.com"),

    // --- Gmail (inbox management) ---
    // Optional: without these three, inbox sync/send run in mock mode —
    // see lib/gmail.ts. Create an OAuth2 client in Google Cloud Console,
    // grant it the gmail.modify scope, and generate a refresh token for
    // the business's Gmail account (not a personal one) via the OAuth2
    // consent flow.
    GMAIL_CLIENT_ID: z.string().optional(),
    GMAIL_CLIENT_SECRET: z.string().optional(),
    GMAIL_REFRESH_TOKEN: z.string().optional(),
    GMAIL_USER_EMAIL: z.string().email().optional(),

    // --- Google Calendar ---
    // Optional: without these, calendar sync/booking run in mock mode —
    // see lib/calendar.ts. Same Google Cloud OAuth2 client as Gmail above
    // works here too — add the calendar scope to it and reuse the same
    // refresh token, or generate a separate one.
    GOOGLE_CALENDAR_CLIENT_ID: z.string().optional(),
    GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_CALENDAR_ID: z.string().default("primary"),

    // --- Invoicing (Stripe Invoices — reuses the Stripe client above) ---
    // No separate credentials: uses STRIPE_SECRET_KEY. Only meaningful
    // once PAYMENTS_MODE=live; drafting/sending invoices in mock mode
    // just logs — see lib/invoicing.ts.

    // --- SMS (Twilio) ---
    // Optional: without these three, SMS sends run in mock mode — see
    // lib/sms.ts.
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.PAYMENTS_MODE !== "live") return;
    for (const key of REQUIRED_IN_LIVE_MODE) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when PAYMENTS_MODE=live`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid backend environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Refusing to start: environment validation failed.");
}

export const env = parsed.data;

export const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim());
