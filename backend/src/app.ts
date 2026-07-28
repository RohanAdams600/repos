import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, allowedOrigins } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { publicRateLimiter } from "./lib/rate-limit.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { checkoutRouter } from "./routes/checkout.js";
import { stripeWebhookRouter } from "./routes/stripe-webhook.js";
import { agentsRouter } from "./routes/agents.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { prospectsRouter } from "./routes/prospects.js";
import { vapiRouter } from "./routes/vapi.js";

/**
 * Builds the Express app without binding a port, so tests can exercise
 * it directly (supertest) without a real listener, and so server.ts stays
 * a one-line entrypoint.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== "test" }));
  app.use(cors({ origin: allowedOrigins }));

  // Stripe webhook needs the raw body for signature verification, so it's
  // mounted with express.raw() BEFORE the global express.json() parser
  // below applies to everything else. Only meaningful in live mode — in
  // mock mode there is no external Stripe to deliver webhooks at all, so
  // the route isn't mounted (hitting it 404s rather than 500ing on a
  // missing signing secret).
  if (env.PAYMENTS_MODE === "live") {
    app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter);
  }

  app.use(express.json());

  app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, paymentsMode: env.PAYMENTS_MODE }));

  app.use("/api/waitlist", publicRateLimiter, waitlistRouter);
  app.use("/api/checkout", publicRateLimiter, checkoutRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/prospects", prospectsRouter);
  app.use("/api/vapi", vapiRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
