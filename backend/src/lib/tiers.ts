/**
 * What a paid tier actually buys, in one place. This is the source of
 * truth the desktop agent's own tier config (desktop-agent/src/config/
 * tiers.ts) mirrors — they're separate npm packages in this monorepo
 * with no shared-lib mechanism between them, so that file carries a
 * comment pointing back here and the two must be kept in sync by hand.
 * If you change a number here, change it there too.
 */
import type { Tier } from "./stripe.js";

/** The four duty categories from the site's own copy — reused verbatim so pricing, site, and product never drift into three different vocabularies for the same thing. */
export type CapabilityLane = "front-desk" | "sales-ledger" | "back-office" | "night-report";

export const CAPABILITY_LANE_LABELS: Record<CapabilityLane, string> = {
  "front-desk": "Front Desk — answer calls/texts, triage inbox, answer common questions",
  "sales-ledger": "Sales Ledger — follow up new leads, qualify, draft quotes",
  "back-office": "Back Office — calendar proposals, invoice drafts, CRM notes",
  "night-report": "Night Report — daily/weekly summaries, flagged items, tracked numbers",
};

export interface TierConfig {
  label: string;
  /** Which duty categories this tier's downloaded agent will actually run. Anything not listed here is skipped every cycle, not run in a degraded way. */
  capabilityLanes: CapabilityLane[];
  /** Tasks processed per rolling 24h before the local agent pauses lane work until the next day — enforced client-side by the downloaded package, not by this backend. */
  dailyTaskCap: number;
  /** Ceiling on how much the downloaded agent can auto-execute without a review step, same three-stage vocabulary as agents/src/orchestrator/trust.ts. */
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
