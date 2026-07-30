export type RevenueBand = "under_20k" | "20k_80k" | "80k_250k" | "250k_plus";
export type TeamSize = "1_4" | "5_20" | "21_50" | "50_plus";
export type Tier = "starter" | "core" | "scale";

/**
 * Mirrors backend/src/lib/tiers.ts and desktop-agent/src/config/tiers.ts —
 * same reasoning as those two files' own comments: no shared lib across
 * these independent packages, so this copy has to be kept in sync by
 * hand. Used only for display copy on the success page; the download
 * itself is gated server-side, this never has to be trusted.
 */
export const TIER_INFO: Record<Tier, { label: string; lanes: string[]; dailyTaskCap: number }> = {
  starter: { label: "Starter", lanes: ["Front Desk"], dailyTaskCap: 40 },
  core: { label: "Core", lanes: ["Front Desk", "Sales Ledger", "Back Office"], dailyTaskCap: 150 },
  scale: { label: "Scale", lanes: ["Front Desk", "Sales Ledger", "Back Office", "Night Report"], dailyTaskCap: 500 },
};

export interface WaitlistInput {
  email: string;
  businessName: string;
  revenueBand: RevenueBand;
  teamSize: TeamSize;
  timeSink: string;
  tierInterest: Tier;
  referredByClient: boolean;
}

export interface DashboardOverview {
  metrics: {
    activeClients: number;
    mrr: number;
    mrrTargetProgressPct: number;
    waitlistCount: number;
    averageLeadScore: number | null;
  };
  recentRuns: {
    task_id: string;
    task_type: string;
    agent: "scout" | "wordsmith" | "patch" | "warden";
    status: "completed" | "failed" | "queued_for_review" | "blocked";
    attempt: number;
    started_at: string;
    finished_at: string;
    assessment_passed: boolean | null;
    assessment_notes: string | null;
  }[];
  runCounts: { agent: string; status: string; count: string }[];
  lastHeartbeat: { tasks_processed: number; tasks_failed: number; trust_stage: string; ran_at: string } | null;
}

export type ProspectStatus = "new" | "approved" | "calling" | "called" | "interested" | "not_interested" | "converted";

export interface Prospect {
  id: string;
  business_name: string;
  category: string;
  phone: string;
  city: string | null;
  state: string | null;
  team_size: TeamSize | null;
  fit_reasoning: string;
  source: "manual" | "scout_research" | "referral";
  status: ProspectStatus;
  created_at: string;
}

export interface NewProspectInput {
  businessName: string;
  category: string;
  phone: string;
  city?: string;
  state?: string;
  teamSize?: TeamSize;
  fitReasoning: string;
}
