import { runScout } from "../sub-agents/research-agent.js";
import { runWordsmith } from "../sub-agents/content-agent.js";
import { runPatch } from "../sub-agents/coding-agent.js";
import { runWarden } from "../sub-agents/review-agent.js";
import type { AgentActionResult, IncomingTask, SubAgentName, TaskRiskLevel, TaskType } from "../types.js";

/**
 * Task type -> sub-agent lane. "One agent, one lane" is enforced here:
 * a task type maps to exactly one sub-agent, never a set to choose
 * between at runtime.
 */
const TASK_ROUTES: Record<TaskType, SubAgentName> = {
  research: "scout",
  "lead-score": "scout",
  "lead-brief": "scout",
  content: "wordsmith",
  code: "patch",
  review: "warden",
};

const RISK_BY_TASK_TYPE: Record<TaskType, TaskRiskLevel> = {
  research: "low",
  "lead-score": "low",
  "lead-brief": "low",
  content: "medium",
  code: "high",
  review: "high",
};

const RUNNERS: Record<SubAgentName, (task: IncomingTask) => Promise<AgentActionResult>> = {
  scout: runScout,
  wordsmith: runWordsmith,
  patch: runPatch,
  warden: runWarden,
};

export function routeTask(task: IncomingTask): { agent: SubAgentName; riskLevel: TaskRiskLevel } {
  const agent = TASK_ROUTES[task.type];
  const riskLevel = RISK_BY_TASK_TYPE[task.type];
  return { agent, riskLevel };
}

export function dispatch(agent: SubAgentName, task: IncomingTask): Promise<AgentActionResult> {
  return RUNNERS[agent](task);
}
