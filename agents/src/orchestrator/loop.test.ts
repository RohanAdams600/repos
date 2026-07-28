import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActionResult, IncomingTask } from "../types.js";

// Low/medium-risk work needs 'supervised' or 'autonomous' to auto-execute
// (see trust.test.ts) — override the 'manual' default from test/setup.ts
// so these tests can actually reach the assess step.
process.env.TRUST_STAGE = "supervised";

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
    type: "research",
    summary: "Research the client's competitor landscape",
    payload: {},
    source: "test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function actionResult(overrides: Partial<AgentActionResult> = {}): AgentActionResult {
  return {
    taskId: "task-1",
    agent: "scout",
    status: "completed",
    output: "findings",
    tokensIn: 10,
    tokensOut: 20,
    model: "claude-sonnet-5",
    durationMs: 5,
    ...overrides,
  };
}

describe("runLoop — Diagnose -> Assemble -> Action -> Assess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMock.routeTask.mockReturnValue({ agent: "scout", riskLevel: "low" });
  });

  it("completes a low-risk task that passes Warden's review on the first attempt", async () => {
    routerMock.dispatch.mockResolvedValue(actionResult());
    reviewMock.runWarden.mockResolvedValue(actionResult({ agent: "warden", output: "VERDICT: PASS" }));
    reviewMock.parseWardenVerdict.mockReturnValue({ passed: true, notes: "looks good", retryRecommended: false });

    const outcome = await runLoop(task());

    expect(outcome.finalStatus).toBe("completed");
    expect(routerMock.dispatch).toHaveBeenCalledTimes(1);
    expect(dbMock.recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", attempt: 1 }));
    expect(alertsMock.alertFounder).not.toHaveBeenCalled();
  });

  it("retries once when Warden fails the output and recommends a retry, then succeeds", async () => {
    routerMock.dispatch
      .mockResolvedValueOnce(actionResult({ output: "sloppy first draft" }))
      .mockResolvedValueOnce(actionResult({ output: "clean second draft" }));
    reviewMock.runWarden
      .mockResolvedValueOnce(actionResult({ agent: "warden", output: "VERDICT: FAIL" }))
      .mockResolvedValueOnce(actionResult({ agent: "warden", output: "VERDICT: PASS" }));
    reviewMock.parseWardenVerdict
      .mockReturnValueOnce({ passed: false, notes: "missed the brief", retryRecommended: true })
      .mockReturnValueOnce({ passed: true, notes: "fixed", retryRecommended: false });

    const outcome = await runLoop(task());

    expect(routerMock.dispatch).toHaveBeenCalledTimes(2);
    expect(outcome.finalStatus).toBe("completed");
    expect(dbMock.recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2 }));
  });

  it("does not retry past MAX_ATTEMPTS even if Warden keeps failing", async () => {
    routerMock.dispatch.mockResolvedValue(actionResult());
    reviewMock.runWarden.mockResolvedValue(actionResult({ agent: "warden", output: "VERDICT: FAIL" }));
    reviewMock.parseWardenVerdict.mockReturnValue({ passed: false, notes: "still wrong", retryRecommended: true });

    const outcome = await runLoop(task());

    expect(routerMock.dispatch).toHaveBeenCalledTimes(2); // MAX_ATTEMPTS
    expect(outcome.finalStatus).toBe("queued_for_review");
  });

  it("skips Warden's self-review — Warden never reviews itself", async () => {
    routerMock.routeTask.mockReturnValue({ agent: "warden", riskLevel: "low" });
    routerMock.dispatch.mockResolvedValue(actionResult({ agent: "warden" }));

    const outcome = await runLoop(task({ type: "review" }));

    expect(routerMock.dispatch).toHaveBeenCalledTimes(1);
    expect(reviewMock.runWarden).not.toHaveBeenCalled();
    expect(outcome.finalStatus).toBe("completed");
  });

  it("short-circuits into the approval queue for high-risk work without dispatching", async () => {
    routerMock.routeTask.mockReturnValue({ agent: "patch", riskLevel: "high" });

    const outcome = await runLoop(task({ type: "code", summary: "Implement the new pricing component" }));

    expect(routerMock.dispatch).not.toHaveBeenCalled();
    expect(outcome.finalStatus).toBe("queued_for_review");
  });

  it("alerts the founder when a hard boundary is hit, in addition to queuing for review", async () => {
    const outcome = await runLoop(task({ summary: "Issue a refund to this client for last month" }));

    expect(routerMock.dispatch).not.toHaveBeenCalled();
    expect(outcome.finalStatus).toBe("queued_for_review");
    expect(alertsMock.alertFounder).toHaveBeenCalledOnce();
    expect(alertsMock.alertFounder.mock.calls[0][0]).toMatch(/hard boundary/i);
  });
});
