import { Router } from "express";
import { z } from "zod";
import { requireDashboardToken } from "../lib/auth.js";
import { getCalendarProposal, listCalendarProposals, markCalendarProposalBooked, markCalendarProposalDeclined } from "../lib/db.js";
import { createCalendarEvent } from "../lib/calendar.js";
import { logger } from "../lib/logger.js";

export const calendarRouter = Router();
calendarRouter.use(requireDashboardToken);

calendarRouter.get("/", async (_req, res) => {
  const proposals = await listCalendarProposals();
  res.status(200).json({ proposals });
});

const bookSchema = z.object({ slot: z.string().datetime() });

/**
 * The only path that actually writes to the real calendar — identity.md
 * boundary #2: "no agent may accept, decline, or move a calendar event
 * on the founder's behalf. Agents may propose times." Scout can only
 * ever reach POST /api/agents/calendar/propose, never this route.
 */
calendarRouter.post("/:id/book", async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const proposal = await getCalendarProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: "proposal_not_found" });
    return;
  }
  if (!proposal.proposed_slots.includes(parsed.data.slot)) {
    res.status(400).json({ error: "slot_not_proposed", message: "That slot wasn't one of the proposed options." });
    return;
  }

  try {
    const result = await createCalendarEvent({
      summary: proposal.purpose,
      description: `Booked for ${proposal.contact_name}${proposal.contact_email ? ` (${proposal.contact_email})` : ""}`,
      startIso: parsed.data.slot,
      durationMinutes: 30,
      attendeeEmail: proposal.contact_email ?? undefined,
    });
    await markCalendarProposalBooked(proposal.id, { googleEventId: result.googleEventId, bookedSlot: parsed.data.slot });
    res.status(200).json({ mock: result.mock });
  } catch (err) {
    logger.error({ err, proposalId: proposal.id }, "failed to book calendar event");
    res.status(500).json({ error: "internal_error" });
  }
});

calendarRouter.post("/:id/decline", async (req, res) => {
  const proposal = await getCalendarProposal(req.params.id);
  if (!proposal) {
    res.status(404).json({ error: "proposal_not_found" });
    return;
  }
  await markCalendarProposalDeclined(proposal.id);
  res.status(200).json({ ok: true });
});
