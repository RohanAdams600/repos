import { Router } from "express";
import type Stripe from "stripe";
import { stripe, TIER_MRR_CENTS, type Tier } from "../lib/stripe.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import {
  attachStripeCustomerToLead,
  markDepositPaid,
  upsertClientFromSubscription,
  markSubscriptionStatus,
  hasProcessedStripeEvent,
  recordStripeEvent,
} from "../lib/db.js";

export const stripeWebhookRouter = Router();

/**
 * Mounted in server.ts with express.raw() (not express.json()) — Stripe
 * signature verification needs the exact raw request body bytes.
 */
stripeWebhookRouter.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing Stripe signature.");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).send(`Webhook signature verification failed.`);
    return;
  }

  // Idempotency: Stripe can and will redeliver events.
  if (await hasProcessedStripeEvent(event.id)) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  try {
    await handleEvent(event);
    await recordStripeEvent(event.id, event.type);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, "failed to process Stripe webhook event");
    // 500 so Stripe retries — do not record as processed on failure.
    res.status(500).json({ error: "processing_failed" });
  }
});

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const kind = session.metadata?.kind;

      if (kind === "deposit") {
        const email = session.metadata?.leadEmail;
        if (email) {
          await markDepositPaid(email);
          if (typeof session.customer === "string") {
            await attachStripeCustomerToLead(email, session.customer);
          }
          logger.info({ email }, "deposit paid — 14-day onboarding window starts now");
        }
      }

      if (kind === "subscription" && typeof session.subscription === "string" && typeof session.customer === "string") {
        const tier = session.metadata?.tier as Tier | undefined;
        const email = session.metadata?.leadEmail;
        const businessName = session.metadata?.businessName;
        if (tier && email && businessName) {
          await upsertClientFromSubscription({
            leadEmail: email,
            businessName,
            tier,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            mrrCents: TIER_MRR_CENTS[tier],
          });
          logger.info({ email, tier }, "new subscription — client onboarding record created");
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const status = subscription.status === "active" ? "active" : subscription.status === "past_due" ? "past_due" : null;
      if (status) await markSubscriptionStatus(subscription.id, status);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await markSubscriptionStatus(subscription.id, "canceled");
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (typeof invoice.subscription === "string") {
        await markSubscriptionStatus(invoice.subscription, "past_due");
      }
      break;
    }

    default:
      logger.debug({ type: event.type }, "unhandled Stripe event type");
  }
}
