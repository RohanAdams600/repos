/**
 * The execution loop: Diagnose -> Assemble -> Action -> Assess.
 * This is what "T — Trust in Stages" runs on: every task, whether
 * dispatched by a founder request, a webhook, or the heartbeat cron,
 * flows through these four steps, and the Assess step is what lets the
 * system self-review and improve rather than just fire-and-forget.
 */
import { randomUUID } from "node:crypto";
import { routeTask, dispatch } from "./router.js";
import { crossesHardBoundary, requiresApproval } from "./trust.js";
import { runWarden, parseWardenVerdict } from "../sub-agents/review-agent.js";
import { MAX_TOKENS_BY_TASK, selectModelForTask } from "../config/models.js";
import { recordAgentRun } from "../lib/db.js";
import { alertFounder } from "../lib/alerts.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import type { AgentActionResult, AgentAssembly, AssessResult, IncomingTask, LoopRunRecord } from "../types.js";

const MAX_ATTEMPTS = 2;

export interface LoopResult {
  task: IncomingTask;
  result: AgentActionResult;
  assessment?: AssessResult;
  finalStatus: AgentActionResult["status"];
}

/** Step 1 — Diagnose: what is this, which lane does it belong to, how risky is it. */
function diagnose(task: IncomingTask) {
  const { agent, riskLevel } = routeTask(task);
  const boundaryHit = crossesHardBoundary(task.summary);
  logger.info({ taskId: task.id, agent, riskLevel, boundaryHit }, "diagnose");
  return { agent, riskLevel, boundaryHit };
}

/** Step 2 — Assemble: decide model + approval gate before any model call happens. */
function assemble(
  task: IncomingTask,
  diagnosis: ReturnType<typeof diagnose>
): AgentAssembly {
  const model = selectModelForTask(diagnosis.agent, task.type, diagnosis.riskLevel);
  const approval = requiresApproval({
    trustStage: env.TRUST_STAGE,
    riskLevel: diagnosis.riskLevel,
    agent: diagnosis.agent,
    crossesHardBoundary: diagnosis.boundaryHit,
  });

  return {
    agent: diagnosis.agent,
    systemPrompt: "(assembled inside runSubAgent from soul/identity/user/playbooks)",
    model,
    maxTokens: MAX_TOKENS_BY_TASK[task.type],
    riskLevel: diagnosis.riskLevel,
    requiresApproval: approval,
  };
}

/**
 * Step 3 — Action: dispatch to the assigned sub-agent. This always runs,
 * trust stage or not — identity.md is explicit that agents "may draft a
 * Stripe action... for the founder to approve," which only makes sense
 * if the draft actually gets produced. What requiresApproval gates is
 * whether the result counts as done automatically or waits for a human
 * to look at it — decided in runLoop below, after the draft exists.
 */
async function action(task: IncomingTask, assembly: AgentAssembly): Promise<AgentActionResult> {
  return dispatch(assembly.agent, task);
}

/** Step 4 — Assess: Warden reviews the output (self-review loop) so the system learns and improves. */
async function assess(task: IncomingTask, result: AgentActionResult): Promise<AssessResult | undefined> {
  if (result.status !== "completed") return undefined;
  if (result.agent === "warden") return undefined; // Warden doesn't review itself

  const reviewTask: IncomingTask = {
    id: randomUUID(),
    type: "review",
    summary: `Review ${result.agent}'s output for task ${task.id}: ${task.summary}`,
    payload: { originalTask: task, agentOutput: result.output },
    source: "loop-assess",
    createdAt: new Date().toISOString(),
  };

  const reviewResult = await runWarden(reviewTask);
  if (reviewResult.status !== "completed") return undefined;

  const verdict = parseWardenVerdict(reviewResult.output);
  return { taskId: task.id, passed: verdict.passed, notes: verdict.notes, retryRecommended: verdict.retryRecommended };
}

/**
 * Runs one task through the full loop, retrying once if Warden fails the
 * output and recommends a retry. Every attempt is persisted via
 * recordAgentRun so the dashboard can show real history, not just the
 * latest state.
 */
export async function runLoop(task: IncomingTask): Promise<LoopResult> {
  const diagnosis = diagnose(task);
  const assembly = assemble(task, diagnosis);

  let attempt = 1;
  let result = await action(task, assembly);
  let assessment = await assess(task, result);

  while (assessment && !assessment.passed && assessment.retryRecommended && attempt < MAX_ATTEMPTS) {
    attempt += 1;
    logger.warn({ taskId: task.id, attempt, notes: assessment.notes }, "assess failed, retrying");
    result = await action(task, assembly);
    assessment = await assess(task, result);
  }

  // The draft/analysis/code-change always gets produced above regardless
  // of trust stage — requiresApproval only decides whether a genuinely
  // completed, Warden-approved result still needs a human look before it
  // counts as "done" (e.g. before anything downstream acts on it).
  const finalStatus: AgentActionResult["status"] =
    result.status !== "completed"
      ? result.status
      : assembly.requiresApproval
        ? "queued_for_review"
        : assessment && !assessment.passed
          ? "queued_for_review"
          : "completed";

  const record: LoopRunRecord = {
    taskId: task.id,
    taskType: task.type,
    agent: assembly.agent,
    status: finalStatus,
    attempt,
    startedAt: task.createdAt,
    finishedAt: new Date().toISOString(),
    assessment,
  };

  await recordAgentRun(record).catch((err) => logger.error({ err }, "failed to persist agent run"));

  if (finalStatus === "queued_for_review" && diagnosis.boundaryHit) {
    await alertFounder(
      `Task ${task.id} (${task.type}) hit a hard boundary and needs your decision: ${task.summary}`
    );
  }

  return { task, result, assessment, finalStatus };
}
