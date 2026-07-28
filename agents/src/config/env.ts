import "dotenv/config";
import { z } from "zod";
import type { TrustStage } from "../types.js";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  BACKEND_BASE_URL: z.string().url(),
  AGENTS_SERVICE_TOKEN: z.string().min(1),
  HEARTBEAT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  TRUST_STAGE: z.enum(["manual", "supervised", "autonomous"]).default("manual"),
  HEARTBEAT_ALERT_CHANNEL: z.string().default(""),
  SLACK_ALERT_WEBHOOK_URL: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid agent environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Refusing to start: environment validation failed.");
}

export const env = {
  ...parsed.data,
  TRUST_STAGE: parsed.data.TRUST_STAGE as TrustStage,
};
