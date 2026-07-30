import { Router } from "express";
import { findDownloadTokenBySession, findDownloadToken, markTokenDownloaded } from "../lib/db.js";
import { streamAgentPackageZip, isDesktopAgentBuilt } from "../lib/agent-package.js";
import { logger } from "../lib/logger.js";

export const downloadsRouter = Router();

/**
 * Public — the session id in the success-page URL (real Stripe or the
 * mock equivalent, see lib/payments.ts) is itself the proof of a
 * completed checkout, the same trust model Stripe's own success_url
 * redirect relies on. Resolves to the actual download token so the
 * frontend never has to construct or guess one.
 */
downloadsRouter.get("/agent/by-session/:sessionId", async (req, res) => {
  const record = await findDownloadTokenBySession(req.params.sessionId);
  if (!record) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json({ token: record.token, tier: record.tier });
});

/** Public — the token itself (a long random value never guessable, only ever seen by the customer it was issued to) is the only credential this needs. */
downloadsRouter.get("/agent/:token", async (req, res) => {
  const record = await findDownloadToken(req.params.token);
  if (!record) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (!isDesktopAgentBuilt()) {
    logger.error("agent download requested but desktop-agent/dist is missing — run `npm run build` in desktop-agent");
    res.status(503).json({ error: "package_not_built" });
    return;
  }

  res.setHeader("content-type", "application/zip");
  res.setHeader("content-disposition", `attachment; filename="autonoma-agent-${record.tier}.zip"`);

  try {
    await streamAgentPackageZip(res, { tier: record.tier, agentKey: record.agent_key });
    await markTokenDownloaded(record.token);
  } catch (err) {
    logger.error({ err, token: record.token }, "failed to stream agent package zip");
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  }
});
