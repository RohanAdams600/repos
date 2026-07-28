/**
 * Kai — the Orchestration Manager Agent. Kai does no task work itself;
 * it diagnoses, assembles, dispatches via the loop, monitors results, and
 * is the single reporting surface back to the founder / backend service.
 * Nothing outside this file talks to sub-agents directly.
 */
import { randomUUID } from "node:crypto";
import { runLoop, type LoopResult } from "./loop.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import type { IncomingTask, TaskType } from "../types.js";

export interface SubmitTaskInput {
  type: TaskType;
  summary: string;
  payload: Record<string, unknown>;
  source: string;
}

class Manager {
  private processed = 0;
  private failed = 0;
  private queuedForReview = 0;

  async submitTask(input: SubmitTaskInput): Promise<LoopResult> {
    const task: IncomingTask = {
      id: randomUUID(),
      type: input.type,
      summary: input.summary,
      payload: input.payload,
      source: input.source,
      createdAt: new Date().toISOString(),
    };

    logger.info({ taskId: task.id, type: task.type, source: task.source }, "Kai: task received");

    const outcome = await runLoop(task);
    this.processed += 1;
    if (outcome.finalStatus === "failed") this.failed += 1;
    if (outcome.finalStatus === "queued_for_review") this.queuedForReview += 1;

    logger.info(
      { taskId: task.id, status: outcome.finalStatus, agent: outcome.result.agent },
      "Kai: task resolved"
    );

    return outcome;
  }

  async submitBatch(inputs: SubmitTaskInput[]): Promise<LoopResult[]> {
    // Sub-agents run one lane each, but independent tasks can fan out concurrently.
    return Promise.all(inputs.map((input) => this.submitTask(input)));
  }

  getSessionStats() {
    return {
      trustStage: env.TRUST_STAGE,
      processed: this.processed,
      failed: this.failed,
      queuedForReview: this.queuedForReview,
    };
  }
}

/** Singleton — one Kai per running process, matching "one orchestrator manages the bench." */
export const kai = new Manager();
