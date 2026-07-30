import { runLane, type LaneResult } from "./run-lane.js";
import type { BusinessProfile } from "../lib/profile.js";
import type { Tier } from "../config/tiers.js";

const ROLE_BLOCK = `You are the Front Desk lane of this business's Night Desk agent.
Draft a reply to whoever reached out — a missed call, a text, or an
inbox message — in this business's own voice, using the business
context below. Answer their question directly if it's something you'd
reasonably know from the business profile (hours, services, general
pricing). If it needs a firm appointment slot or an exact quote, say
you'll confirm shortly rather than inventing one. Keep it to 2-4
sentences, ready to send as-is once the owner reviews it — you are
drafting, never sending.`;

export async function runFrontDesk(profile: BusinessProfile, tier: Tier): Promise<LaneResult> {
  return runLane({ lane: "front-desk", roleBlock: ROLE_BLOCK, profile, tier });
}
