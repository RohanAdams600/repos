import { Router } from "express";
import { requireDashboardToken } from "../lib/auth.js";
import { getProspect, insertColdCall, setProspectStatus } from "../lib/db.js";
import { startColdCall, ALLOWED_ASSISTANTS } from "../lib/vapi.js";
import { logger } from "../lib/logger.js";

export const vapiRouter = Router();

/**
 * Gated by requireDashboardToken — the founder's authenticated dashboard
 * session IS the approval step. Nothing in /agents can reach this route;
 * it isn't proxied through /api/agents/*, so an autonomous-trust-stage
 * agent has no path to placing a call on its own (identity.md #6).
 */
vapiRouter.use(requireDashboardToken);

vapiRouter.post("/cold-call/:prospectId", async (req, res) => {
  const prospect = await getProspect(req.params.prospectId);
  if (!prospect) {
    res.status(404).json({ error: "prospect_not_found" });
    return;
  }

  try {
    const call = await startColdCall({ prospectPhone: prospect.phone, prospectName: prospect.business_name });

    await insertColdCall({
      prospectId: prospect.id,
      vapiCallId: call.vapiCallId,
      assistantId: ALLOWED_ASSISTANTS.coldCall,
      status: call.status,
      triggeredBy: "founder_dashboard",
    });
    await setProspectStatus(prospect.id, "calling");

    res.status(200).json({ mock: call.mock, vapiCallId: call.vapiCallId, status: call.status });
  } catch (err) {
    logger.error({ err, prospectId: prospect.id }, "failed to place cold call");
    res.status(500).json({ error: "internal_error" });
  }
});
