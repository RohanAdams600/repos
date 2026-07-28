import { Router } from "express";
import { z } from "zod";
import { requireDashboardToken } from "../lib/auth.js";
import { insertProspect, listProspects, setProspectStatus } from "../lib/db.js";

export const prospectsRouter = Router();
prospectsRouter.use(requireDashboardToken);

prospectsRouter.get("/", async (_req, res) => {
  const prospects = await listProspects();
  res.status(200).json({ prospects });
});

const createSchema = z.object({
  businessName: z.string().min(2).max(200),
  category: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  teamSize: z.enum(["1_4", "5_20", "21_50", "50_plus"]).optional(),
  fitReasoning: z.string().min(10).max(500),
  source: z.enum(["manual", "scout_research", "referral"]).default("manual"),
});

prospectsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const prospect = await insertProspect(parsed.data);
  res.status(201).json({ prospect });
});

const statusSchema = z.object({
  status: z.enum(["new", "approved", "calling", "called", "interested", "not_interested", "converted"]),
});

prospectsRouter.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  await setProspectStatus(req.params.id, parsed.data.status);
  res.status(200).json({ ok: true });
});
