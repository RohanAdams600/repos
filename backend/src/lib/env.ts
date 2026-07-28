import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().min(1).default("http://localhost:3000"),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_DEPOSIT: z.string().min(1),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().min(1),
  STRIPE_PRICE_CORE_MONTHLY: z.string().min(1),
  STRIPE_PRICE_SCALE_MONTHLY: z.string().min(1),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),

  AGENTS_SERVICE_TOKEN: z.string().min(1),
  DASHBOARD_TOKEN: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid backend environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Refusing to start: environment validation failed.");
}

export const env = parsed.data;

export const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim());
