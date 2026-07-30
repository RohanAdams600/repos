/**
 * Payments abstraction so routes never call Stripe directly. In
 * PAYMENTS_MODE=mock (the default — see env.ts) there is no real Stripe
 * account required at all: a "checkout session" completes the same DB
 * write a real Stripe webhook would eventually trigger, synchronously,
 * and hands back a URL straight to the success page. That's what makes
 * the waitlist -> deposit -> kickoff funnel fully clickable in a demo
 * before Stripe is configured. Flip PAYMENTS_MODE to 'live' and nothing
 * in routes/checkout.ts has to change — only this file's branch does.
 */
import { randomUUID } from "node:crypto";
import { stripe, priceIdForTier, TIER_MRR_CENTS, type Tier } from "./stripe.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { attachStripeCustomerToLead, markDepositPaid, upsertClientFromSubscription, issueAgentDownloadToken } from "./db.js";

export interface CheckoutSession {
  url: string;
  mock: boolean;
}

export async function createDepositCheckout(input: { email: string; leadId: string }): Promise<CheckoutSession> {
  if (env.PAYMENTS_MODE === "mock") {
    const fakeCustomerId = `cus_mock_${randomUUID().slice(0, 12)}`;
    await attachStripeCustomerToLead(input.email, fakeCustomerId);
    await markDepositPaid(input.email);
    logger.info(
      { email: input.email, leadId: input.leadId },
      "[mock payments] deposit marked paid instantly — no real charge occurred, PAYMENTS_MODE=mock"
    );
    return { url: `${env.CHECKOUT_SUCCESS_URL}?mock=1&kind=deposit`, mock: true };
  }

  if (!stripe) throw new Error("PAYMENTS_MODE=live but the Stripe client failed to initialize.");
  if (!env.STRIPE_PRICE_DEPOSIT) throw new Error("STRIPE_PRICE_DEPOSIT is not set — check backend/.env");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    line_items: [{ price: env.STRIPE_PRICE_DEPOSIT, quantity: 1 }],
    success_url: env.CHECKOUT_SUCCESS_URL,
    cancel_url: env.CHECKOUT_CANCEL_URL,
    metadata: { kind: "deposit", leadId: input.leadId, leadEmail: input.email },
  });
  return { url: session.url ?? env.CHECKOUT_SUCCESS_URL, mock: false };
}

export async function createSubscriptionCheckout(input: {
  email: string;
  businessName: string;
  tier: Tier;
}): Promise<CheckoutSession> {
  if (env.PAYMENTS_MODE === "mock") {
    const fakeCustomerId = `cus_mock_${randomUUID().slice(0, 12)}`;
    const fakeSubscriptionId = `sub_mock_${randomUUID().slice(0, 12)}`;
    const fakeSessionId = `sess_mock_${randomUUID().slice(0, 12)}`;
    const clientId = await upsertClientFromSubscription({
      leadEmail: input.email,
      businessName: input.businessName,
      tier: input.tier,
      stripeCustomerId: fakeCustomerId,
      stripeSubscriptionId: fakeSubscriptionId,
      mrrCents: TIER_MRR_CENTS[input.tier],
    });
    // Real Stripe checkout redirects with the actual session id in the
    // {CHECKOUT_SESSION_ID} placeholder (see the live branch below) — the
    // success page always resolves a download via /api/downloads/agent/
    // by-session/:sessionId, so mock mode has to hand it an equally real
    // session id, not skip straight to a token, or the two code paths
    // would diverge on the one thing that actually matters here.
    await issueAgentDownloadToken({ clientId, tier: input.tier, stripeCheckoutSessionId: fakeSessionId });
    logger.info(
      { email: input.email, tier: input.tier },
      "[mock payments] subscription activated instantly — no real charge occurred, PAYMENTS_MODE=mock"
    );
    return {
      url: `${env.CHECKOUT_SUCCESS_URL}?mock=1&kind=subscription&tier=${input.tier}&session_id=${fakeSessionId}`,
      mock: true,
    };
  }

  if (!stripe) throw new Error("PAYMENTS_MODE=live but the Stripe client failed to initialize.");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.email,
    line_items: [{ price: priceIdForTier(input.tier), quantity: 1 }],
    success_url: `${env.CHECKOUT_SUCCESS_URL}?kind=subscription&tier=${input.tier}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.CHECKOUT_CANCEL_URL,
    metadata: {
      kind: "subscription",
      tier: input.tier,
      businessName: input.businessName,
      leadEmail: input.email,
    },
  });
  return { url: session.url ?? env.CHECKOUT_SUCCESS_URL, mock: false };
}
