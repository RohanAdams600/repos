import { Router } from "express";
import { z } from "zod";
import { stripe, priceIdForTier } from "../lib/stripe.js";
import { findLeadByEmail } from "../lib/db.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

export const checkoutRouter = Router();

const depositSchema = z.object({ email: z.string().email() });

/**
 * Pre-Sell & Validation strategy: a $200 one-time deposit (credited
 * against the client's first month, see checkout metadata) reserves their
 * onboarding slot before any client-specific backend work starts.
 */
checkoutRouter.post("/deposit", async (req, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const lead = await findLeadByEmail(parsed.data.email);
  if (!lead) {
    res.status(404).json({ error: "lead_not_found", message: "Join the waitlist first." });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: parsed.data.email,
      line_items: [{ price: env.STRIPE_PRICE_DEPOSIT, quantity: 1 }],
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
      metadata: { kind: "deposit", leadId: lead.id, leadEmail: lead.email },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "failed to create deposit checkout session");
    res.status(500).json({ error: "internal_error" });
  }
});

const subscriptionSchema = z.object({
  email: z.string().email(),
  businessName: z.string().min(2).max(200),
  tier: z.enum(["starter", "core", "scale"]),
});

/**
 * Post onboarding-call conversion into a recurring subscription at one of
 * the three decoy-pricing tiers. Founder/Kai sends the client the link
 * this returns after the call — this is not a self-serve checkout on the
 * public site, matching the "no complex software upfront, sell the
 * relationship first" model.
 */
checkoutRouter.post("/subscription", async (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: parsed.data.email,
      line_items: [{ price: priceIdForTier(parsed.data.tier), quantity: 1 }],
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
      metadata: {
        kind: "subscription",
        tier: parsed.data.tier,
        businessName: parsed.data.businessName,
        leadEmail: parsed.data.email,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "failed to create subscription checkout session");
    res.status(500).json({ error: "internal_error" });
  }
});
