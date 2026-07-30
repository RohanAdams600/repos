import "dotenv/config";
import { z } from "zod";

/**
 * SUBSCRIPTION_TIER and AGENT_KEY are stamped into .env by
 * backend/src/routes/downloads.ts at download time — they are not meant
 * to be hand-edited. ANTHROPIC_API_KEY is deliberately left blank in the
 * shipped .env: this package runs on the customer's own machine against
 * their own Anthropic usage, so their key never passes through Night
 * Desk's servers. index.ts checks for it before running any lane and
 * sends the customer to the setup wizard if it's missing, rather than
 * failing the whole process the way a required-at-import zod field would.
 */
export const envSchema = z.object({
  SUBSCRIPTION_TIER: z.enum(["starter", "core", "scale"]),
  AGENT_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  HEARTBEAT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  WIZARD_PORT: z.coerce.number().int().positive().default(4090),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "This .env is missing the tier/agent key Night Desk stamps into every download.",
    parsed.error.flatten().fieldErrors
  );
  console.error("If you edited .env by hand, re-download the package from your account instead of patching this one.");
  throw new Error("Refusing to start: environment validation failed.");
}

export const env = parsed.data;

export function hasApiKey(): boolean {
  return env.ANTHROPIC_API_KEY.trim().length > 0;
}
