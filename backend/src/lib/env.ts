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
