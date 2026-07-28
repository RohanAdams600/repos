import rateLimit from "express-rate-limit";

/**
 * Applied to the two unauthenticated, public-facing route groups
 * (waitlist signup, checkout session creation) that a scraper or bot
 * could otherwise hammer. Internal routes (/api/agents/*, /api/dashboard/*)
 * are already gated by a bearer token and don't need this.
 */
export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests — try again shortly." },
});
