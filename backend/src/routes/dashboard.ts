import { Router } from "express";
import { requireDashboardToken } from "../lib/auth.js";
import { getDashboardMetrics, getRecentAgentRuns, getAgentRunCountsByAgent, getLastHeartbeat } from "../lib/db.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireDashboardToken);

/** 100 clients at Core's $4,000/mo (see lib/stripe.ts's TIER_MRR_CENTS) — the "Target unit economics" figure from the root README's Part 1. */
const MRR_TARGET_DOLLARS = 400_000;

dashboardRouter.get("/overview", async (_req, res) => {
  const [metrics, recentRuns, runCounts, lastHeartbeat] = await Promise.all([
    getDashboardMetrics(),
    getRecentAgentRuns(20),
    getAgentRunCountsByAgent(),
    getLastHeartbeat(),
  ]);

  res.status(200).json({
    metrics: {
      activeClients: metrics.activeClients,
      mrr: metrics.mrrCents / 100,
      mrrTargetProgressPct: Math.round((metrics.mrrCents / 100 / MRR_TARGET_DOLLARS) * 100),
      waitlistCount: metrics.waitlistCount,
      averageLeadScore: metrics.averageLeadScore,
    },
    recentRuns,
    runCounts,
    lastHeartbeat,
  });
});
