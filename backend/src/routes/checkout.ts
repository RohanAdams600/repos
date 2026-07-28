import { Router } from "express";
import { z } from "zod";
import { createDepositCheckout, createSubscriptionCheckout } from "../lib/payments.js";
import { findLeadByEmail } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export const checkoutRouter = Router();

const depositSchema = z.object({ email: z.string().email() });

/**
 * Pre-Sell & Validation strategy: a $200 one-time deposit (credited
 * against the client's first month) reserves their onboarding slot
 * before any client-specific backend work starts. Runs against a mock
 * checkout in PAYMENTS_MODE=mock (the default) — see lib/payments.ts.
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
    const session = await createDepositCheckout({ email: parsed.data.email, leadId: lead.id });
    res.status(200).json(session);
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
    const session = await createSubscriptionCheckout(parsed.data);
    res.status(200).json(session);
  } catch (err) {
    logger.error({ err }, "failed to create subscription checkout session");
    res.status(500).json({ error: "internal_error" });
  }
});
