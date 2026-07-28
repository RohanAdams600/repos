import Stripe from "stripe";
import { env } from "./env.js";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

export type Tier = "starter" | "core" | "scale";

export const TIER_PRICE_IDS: Record<Tier, string> = {
  starter: env.STRIPE_PRICE_STARTER_MONTHLY,
  core: env.STRIPE_PRICE_CORE_MONTHLY,
  scale: env.STRIPE_PRICE_SCALE_MONTHLY,
};

export const TIER_MRR_CENTS: Record<Tier, number> = {
  starter: 50_000,
  core: 100_000,
  scale: 1_000_000,
};

export function priceIdForTier(tier: Tier): string {
  return TIER_PRICE_IDS[tier];
}
