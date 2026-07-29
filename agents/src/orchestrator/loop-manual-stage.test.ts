import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActionResult, IncomingTask } from "../types.js";

// Deliberately does NOT override TRUST_STAGE — stays at the 'manual'
// default from test/setup.ts. This is the regression test for a real bug:
// the sub-agent used to be skipped entirely whenever approval was
// required, so manual stage (the default every fresh install starts in)
// produced empty drafts. identity.md and the site copy both promise
// "Wordsmith drafts, you review the draft" — which only holds if a draft
// actually gets produced. See loop.ts's action()/runLoop() comments.
const routerMock = vi.hoisted(() => ({ routeTask: vi.fn(), dispatch: vi.fn() }));
vi.mock("./router.js", () => routerMock);

const reviewMock = vi.hoisted(() => ({ runWarden: vi.fn(), parseWardenVerdict: vi.fn() }));
vi.mock("../sub-agents/review-agent.js", () => reviewMock);

const dbMock = vi.hoisted(() => ({ recordAgentRun: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/db.js", () => dbMock);

const alertsMock = vi.hoisted(() => ({ alertFounder: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/alerts.js", () => alertsMock);

const { runLoop } = await import("./loop.js");

function task(overrides: Partial<IncomingTask> = {}): IncomingTask {
  return {
    id: "task-1",
    type: "content",
    summary: "Draft a reply to this inbound email",
    payload: {},
    source: "test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function actionResult(overrides: Partial<AgentActionResult> = {}): AgentActionResult {
  return {
    taskId: "task-1",
    agent: "wordsmith",
    status: "completed",
    output: "Sure, Thursday at 2pm works — see you then!",
    tokensIn: 10,
    tokensOut: 20,
    model: "claude-sonnet-5",
    durationMs: 5,
    ...overrides,
  };
}

describe("runLoop in manual trust stage (the default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMock.routeTask.mockReturnValue({ agent: "wordsmith", riskLevel: "medium" });
  });

  it("still dispatches to the sub-agent and produces a real draft, even though it queues for review", async () => {
    routerMock.dispatch.mockResolvedValue(actionResult());
    reviewMock.runWarden.mockResolvedValue(actionResult({ agent: "warden", output: "VERDICT: PASS" }));
    reviewMock.parseWardenVerdict.mockReturnValue({ passed: true, notes: "looks good", retryRecommended: false });

    const outcome = await runLoop(task());

    expect(routerMock.dispatch).toHaveBeenCalledTimes(1);
    expect(outcome.result.output).toBe("Sure, Thursday at 2pm works — see you then!");
    expect(outcome.result.output).not.toBe("");
    expect(outcome.finalStatus).toBe("queued_for_review");
    // Warden's assess step only runs on a 'completed' sub-agent result —
    // it should still get a chance to review this draft even though the
    // trust stage will hold the final status for founder review either way.
    expect(reviewMock.runWarden).toHaveBeenCalledTimes(1);
  });
});
