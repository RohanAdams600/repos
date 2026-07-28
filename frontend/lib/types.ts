export type RevenueBand = "under_20k" | "20k_80k" | "80k_250k" | "250k_plus";
export type TeamSize = "1_4" | "5_20" | "21_50" | "50_plus";
export type Tier = "starter" | "core" | "scale";

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
