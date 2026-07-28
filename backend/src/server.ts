import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env, allowedOrigins } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { checkoutRouter } from "./routes/checkout.js";
import { stripeWebhookRouter } from "./routes/stripe-webhook.js";
import { agentsRouter } from "./routes/agents.js";
import { dashboardRouter } from "./routes/dashboard.js";

const app = express();

app.use(pinoHttp({ logger }));
app.use(cors({ origin: allowedOrigins }));

// Stripe webhook needs the raw body for signature verification, so it is
// mounted with express.raw() BEFORE the global express.json() parser
// below applies to everything else.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter);

app.use(express.json());

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use("/api/waitlist", waitlistRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Autonoma backend listening");
});
