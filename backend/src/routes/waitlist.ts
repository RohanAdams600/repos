import { Router } from "express";
import { z } from "zod";
import { insertLead } from "../lib/db.js";
import { notifyNewWaitlistLead } from "../lib/email.js";
import { logger } from "../lib/logger.js";

export const waitlistRouter = Router();

const waitlistSchema = z.object({
  email: z.string().email(),
  businessName: z.string().min(2).max(200),
  revenueBand: z.enum(["under_20k", "20k_80k", "80k_250k", "250k_plus"]),
  teamSize: z.enum(["1_4", "5_20", "21_50", "50_plus"]),
  timeSink: z.string().min(10).max(500),
  tierInterest: z.enum(["starter", "core", "scale"]),
  referredByClient: z.boolean().default(false),
});

waitlistRouter.post("/", async (req, res) => {
  const parsed = waitlistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const lead = await insertLead({
      email: parsed.data.email,
      businessName: parsed.data.businessName,
      revenueBand: parsed.data.revenueBand,
      teamSize: parsed.data.teamSize,
      timeSink: parsed.data.timeSink,
      tierInterest: parsed.data.tierInterest,
      referredByClient: parsed.data.referredByClient,
    });

    logger.info({ leadId: lead.id, email: lead.email }, "waitlist signup received");
    // Fire-and-forget — notifyNewWaitlistLead never throws, and the
    // signup response shouldn't wait on an email round trip.
    void notifyNewWaitlistLead({
      email: lead.email,
      businessName: parsed.data.businessName,
      tierInterest: parsed.data.tierInterest,
      timeSink: parsed.data.timeSink,
    });
    res.status(201).json({ id: lead.id, email: lead.email });
  } catch (err) {
    logger.error({ err }, "failed to insert waitlist lead");
    res.status(500).json({ error: "internal_error" });
  }
});
