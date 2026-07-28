/**
 * Trust progression (T in the AGENT framework): review everything manually
 * at first, loosen the leash as the system proves itself, then run
 * unattended on a heartbeat. This file is the single place that decides
 * "does this output need a human before it counts as done" — trust stage
 * plus task risk plus agent, never anything softer than that.
 *
 * The hard boundaries in identity.md (money movement, calendar, >1-recipient
 * sends, out-of-lane work, destructive DB ops) are NOT trust-stage
 * dependent — they always require approval, even in `autonomous` stage.
 * Trust stages only ever loosen the *non-boundary* review requirement.
 */
import type { SubAgentName, TaskRiskLevel, TrustStage } from "../types.js";

const HARD_BOUNDARY_AGENTS_ALWAYS_GATED: SubAgentName[] = []; // reserved: an agent could be fully gated regardless of stage

export function requiresApproval(params: {
  trustStage: TrustStage;
  riskLevel: TaskRiskLevel;
  agent: SubAgentName;
  crossesHardBoundary: boolean;
}): boolean {
  const { trustStage, riskLevel, agent, crossesHardBoundary } = params;

  if (crossesHardBoundary) return true;
  if (HARD_BOUNDARY_AGENTS_ALWAYS_GATED.includes(agent)) return true;

  switch (trustStage) {
    case "manual":
      return true; // everything reviewed by a human, no exceptions
    case "supervised":
      return riskLevel !== "low"; // low-risk (research, lead scoring) auto-executes
    case "autonomous":
      return riskLevel === "high"; // even unattended, high-risk output (code, final review gate) queues for review
    default:
      return true;
  }
}

/**
 * Cheap boundary sniff-test run before dispatch, on top of the narrow
 * scope each sub-agent's own system prompt already enforces. This is a
 * second, code-level check — not a substitute for the prompt-level
 * boundary, a backstop for it.
 */
export function crossesHardBoundary(taskSummary: string): boolean {
  const boundaryPatterns = [
    /\brefund\b/i,
    /\bissue (a )?refund\b/i,
    /\bchange (the )?(subscription )?price\b/i,
    /\b(cancel|move|reschedule) .*(calendar|meeting|event)\b/i,
    /\bdelete\b.*\b(production|database|table)\b/i,
    /\bblast\b|\ball clients\b|\bevery client\b/i,
    /\b(place|start|make|initiate)\b.*\b(cold )?call\b/i,
    /\bcall\b.*\bprospect\b/i,
    /\bdial\b/i,
  ];
  return boundaryPatterns.some((pattern) => pattern.test(taskSummary));
}
