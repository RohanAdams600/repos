import { complete } from "../lib/anthropic-client.js";
import { assembleContext, type PlaybookName } from "../lib/memory.js";
import { selectModelForTask } from "../config/models.js";
import { logger } from "../lib/logger.js";
import type { AgentActionResult, IncomingTask, SubAgentName, TaskRiskLevel } from "../types.js";

export interface SubAgentDefinition {
  name: SubAgentName;
  /** One-sentence lane definition, enforced by Warden's review, never crossed. */
  scope: string;
  roleBlock: string;
  playbooks: PlaybookName[];
  maxTokens: number;
  riskLevel: TaskRiskLevel;
}

/**
 * Shared execution path for every sub-agent: build a bounded context
 * window (identity + narrow role + only the playbooks this task needs),
 * call the model, return a structured result. Sub-agent files below only
 * declare *what* the agent is — this function is the only place that
 * actually talks to Anthropic on their behalf, so every agent goes
 * through the same context hygiene and logging.
 */
export async function runSubAgent(def: SubAgentDefinition, task: IncomingTask): Promise<AgentActionResult> {
  const started = Date.now();
  const model = selectModelForTask(def.name, task.type, def.riskLevel);
  const system = await assembleContext({ roleBlock: def.roleBlock, playbooks: def.playbooks });

  logger.info({ agent: def.name, taskId: task.id, model }, "sub-agent dispatched");

  try {
    const result = await complete({
      model,
      system,
      maxTokens: def.maxTokens,
      messages: [{ role: "user", content: formatTaskPrompt(task) }],
    });

    return {
      taskId: task.id,
      agent: def.name,
      status: "completed",
      output: result.text,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    logger.error({ agent: def.name, taskId: task.id, err }, "sub-agent execution failed");
    return {
      taskId: task.id,
      agent: def.name,
      status: "failed",
      output: "",
      tokensIn: 0,
      tokensOut: 0,
      model,
      durationMs: Date.now() - started,
      blockedReason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

function formatTaskPrompt(task: IncomingTask): string {
  return [
    `Task ID: ${task.id}`,
    `Task type: ${task.type}`,
    `Source: ${task.source}`,
    `Summary: ${task.summary}`,
    "",
    "Payload:",
    JSON.stringify(task.payload, null, 2),
  ].join("\n");
}
