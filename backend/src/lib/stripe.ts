import Stripe from "stripe";
import { env } from "./env.js";

export type Tier = "starter" | "core" | "scale";

/**
 * Only constructed in PAYMENTS_MODE=live, where env.ts's superRefine has
 * already guaranteed STRIPE_SECRET_KEY is present. Every call site that
 * needs it goes through the live branch of lib/payments.ts, which is the
 * only place this is imported.
 */
export const stripe: Stripe | null =
  env.PAYMENTS_MODE === "live" ? new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" }) : null;

export const TIER_PRICE_IDS: Record<Tier, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER_MONTHLY,
  core: env.STRIPE_PRICE_CORE_MONTHLY,
  scale: env.STRIPE_PRICE_SCALE_MONTHLY,
};

export const TIER_MRR_CENTS: Record<Tier, number> = {
  starter: 100_000,
  core: 400_000,
  scale: 2_000_000,
};

export function priceIdForTier(tier: Tier): string {
  const priceId = TIER_PRICE_IDS[tier];
  if (!priceId) throw new Error(`No Stripe price configured for tier "${tier}" — check backend/.env`);
  return priceId;
}
