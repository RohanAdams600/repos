/**
 * Mirrors backend/src/lib/tiers.ts exactly. That file is the source of
 * truth — it's what decides which tier gets stamped into this package's
 * .env at download time (backend/src/routes/downloads.ts). This copy
 * exists because desktop-agent is a separate npm package with no shared
 * lib to import across the monorepo boundary. If you change a number on
 * one side, change it on the other — a test in tiers.test.ts pins the
 * exact shape so a drift shows up as a failing test, not a silent bug.
 */
export type Tier = "starter" | "core" | "scale";

export type CapabilityLane = "front-desk" | "sales-ledger" | "back-office" | "night-report";

export const CAPABILITY_LANE_LABELS: Record<CapabilityLane, string> = {
  "front-desk": "Front Desk — answer calls/texts, triage inbox, answer common questions",
  "sales-ledger": "Sales Ledger — follow up new leads, qualify, draft quotes",
  "back-office": "Back Office — calendar proposals, invoice drafts, CRM notes",
  "night-report": "Night Report — daily/weekly summaries, flagged items, tracked numbers",
};

export interface TierConfig {
  label: string;
  capabilityLanes: CapabilityLane[];
  dailyTaskCap: number;
  trustStageCeiling: "manual" | "supervised" | "autonomous";
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  starter: {
    label: "Starter",
    capabilityLanes: ["front-desk"],
    dailyTaskCap: 40,
    trustStageCeiling: "manual",
  },
  core: {
    label: "Core",
    capabilityLanes: ["front-desk", "sales-ledger", "back-office"],
    dailyTaskCap: 150,
    trustStageCeiling: "supervised",
  },
  scale: {
    label: "Scale",
    capabilityLanes: ["front-desk", "sales-ledger", "back-office", "night-report"],
    dailyTaskCap: 500,
    trustStageCeiling: "autonomous",
  },
};

export function tierConfig(tier: Tier): TierConfig {
  return TIER_CONFIG[tier];
}

export function isLaneEnabled(tier: Tier, lane: CapabilityLane): boolean {
  return TIER_CONFIG[tier].capabilityLanes.includes(lane);
}
