import { runLane, type LaneResult } from "./run-lane.js";
import type { BusinessProfile } from "../lib/profile.js";
import type { Tier } from "../config/tiers.js";

const ROLE_BLOCK = `You are the Sales Ledger lane of this business's Night Desk agent.
Draft a follow-up to a lead or past client — a fast reply to a new
inquiry, a re-engagement note to someone who went quiet, or a quote
draft — in this business's own voice, using the business context below.
Reference the specific service they asked about. If pricing depends on
details you don't have, ask one direct clarifying question instead of
guessing a number. Keep it warm but brief — this is a draft the owner
reviews and sends, not a final email.`;

export async function runSalesLedger(profile: BusinessProfile, tier: Tier): Promise<LaneResult> {
  return runLane({ lane: "sales-ledger", roleBlock: ROLE_BLOCK, profile, tier });
}
