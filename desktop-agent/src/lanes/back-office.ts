import { runLane, type LaneResult } from "./run-lane.js";
import { MODELS } from "../lib/anthropic-client.js";
import type { BusinessProfile } from "../lib/profile.js";
import type { Tier } from "../config/tiers.js";

const ROLE_BLOCK = `You are the Back Office lane of this business's Night Desk agent.
Draft the admin item described — an invoice line-item summary, a
calendar-slot proposal, or a CRM note — clearly and precisely, using the
business context below. Never state a final invoice total as sent or a
calendar slot as booked: you are producing a draft for the owner to
check and act on themselves. If a dollar amount or date is ambiguous,
flag it plainly instead of picking one.`;

/**
 * Runs on the top-tier model, not the default — this lane touches money
 * and the calendar, the same two things identity.md's hard boundaries
 * are built around for the hosted product. A wrong number here is more
 * expensive than a slightly off tone in a front-desk reply.
 */
export async function runBackOffice(profile: BusinessProfile, tier: Tier): Promise<LaneResult> {
  return runLane({ lane: "back-office", roleBlock: ROLE_BLOCK, profile, tier, model: MODELS.OPUS });
}
