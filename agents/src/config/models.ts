/**
 * Model tiering. High-volume, low-ambiguity work goes to Haiku. Default
 * sub-agent work runs on Sonnet. Only the manager's diagnose/assemble
 * decisions and the review agent's final QA pass — the two places a wrong
 * call is expensive — use the top tier.
 */
import type { SubAgentName, TaskType, TaskRiskLevel } from "../types.js";

export const MODELS = {
  /** High-volume, cheap, low-ambiguity: lead scoring, data extraction, triage classification */
  HAIKU: "claude-haiku-4-5-20251001",
  /** Default workhorse for sub-agent task execution */
  SONNET: "claude-sonnet-5",
  /** Complex orchestration judgment: Kai's diagnose/assemble step, Warden's final QA gate */
  OPUS: "claude-opus-5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

const HIGH_VOLUME_TYPES: TaskType[] = ["lead-score"];

/**
 * Per-sub-agent default model. Overridden per-task by `selectModelForTask`
 * when the task is flagged high-volume/low-ambiguity or high-risk.
 */
export const SUB_AGENT_DEFAULT_MODEL: Record<SubAgentName, ModelId> = {
  scout: MODELS.SONNET,
  wordsmith: MODELS.SONNET,
  patch: MODELS.SONNET,
  warden: MODELS.OPUS, // final QA gate before anything ships — accuracy over cost
};

export function selectModelForTask(
  agent: SubAgentName,
  taskType: TaskType,
  riskLevel: TaskRiskLevel
): ModelId {
  if (HIGH_VOLUME_TYPES.includes(taskType)) return MODELS.HAIKU;
  if (riskLevel === "high") return MODELS.OPUS;
  return SUB_AGENT_DEFAULT_MODEL[agent];
}

/** Kai's own diagnose/assemble reasoning always runs on the top tier — routing mistakes cascade. */
export const MANAGER_MODEL: ModelId = MODELS.OPUS;

export const MAX_TOKENS_BY_TASK: Record<TaskType, number> = {
  research: 2048,
  content: 1536,
  code: 4096,
  review: 1536,
  "lead-score": 256,
  "lead-brief": 1024,
};
