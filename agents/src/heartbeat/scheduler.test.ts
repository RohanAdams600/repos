import { beforeEach, describe, expect, it, vi } from "vitest";

// Kai is a singleton manager instance, not a namespace of functions, so the
// mock has to shape-match that: an object with the methods runHeartbeat
// actually calls, hoisted so vi.mock's factory can close over it.
const kaiMock = vi.hoisted(() => ({
  submitBatch: vi.fn(),
  getSessionStats: vi.fn(() => ({ trustStage: "manual", processed: 0, failed: 0, queuedForReview: 0 })),
}));
vi.mock("../orchestrator/manager.js", () => ({ kai: kaiMock }));

const dbMock = vi.hoisted(() => ({
  recordHeartbeat: vi.fn().mockResolvedValue(undefined),
  fetchUnscoredLeads: vi.fn().mockResolvedValue([]),
  fetchRecentGuaranteeSLABreaches: vi.fn().mockResolvedValue([]),
  markGuaranteeFlagged: vi.fn().mockResolvedValue(undefined),
  triggerNightlyReport: vi.fn().mockResolvedValue({ sent: false }),
  syncInbox: vi.fn().mockResolvedValue({ synced: 0 }),
  fetchPendingInboxMessages: vi.fn().mockResolvedValue([]),
  submitInboxDraft: vi.fn().mockResolvedValue(undefined),
  fetchPendingSms: vi.fn().mockResolvedValue([]),
  submitSmsDraft: vi.fn().mockResolvedValue(undefined),
  proposeCalendarSlots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/db.js", () => dbMock);

const alertsMock = vi.hoisted(() => ({ alertFounder: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/alerts.js", () => alertsMock);

const { runHeartbeat } = await import("./scheduler.js");

function loopResult(output: string) {
  return { task: {}, result: { output }, finalStatus: "queued_for_review" };
}

describe("runHeartbeat: inbox drafting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when there are no pending messages", async () => {
    dbMock.fetchPendingInboxMessages.mockResolvedValue([]);

    await runHeartbeat();

    expect(kaiMock.submitBatch).not.toHaveBeenCalled();
    expect(dbMock.submitInboxDraft).not.toHaveBeenCalled();
  });

  it("drafts a reply for each pending email and submits it", async () => {
    dbMock.fetchPendingInboxMessages.mockResolvedValue([
      { id: "m1", from_email: "owner@acme.com", subject: "Quick question", body: "What are your hours?" },
    ]);
    kaiMock.submitBatch.mockImplementation((inputs: unknown[]) =>
      Promise.resolve(inputs.map(() => loopResult("We're open 8-5 Monday to Friday.")))
    );

    await runHeartbeat();

    expect(kaiMock.submitBatch).toHaveBeenCalledWith([
      expect.objectContaining({ type: "content", source: "heartbeat" }),
    ]);
    expect(dbMock.submitInboxDraft).toHaveBeenCalledWith("m1", "We're open 8-5 Monday to Friday.");
    expect(dbMock.proposeCalendarSlots).not.toHaveBeenCalled();
  });

  it("proposes calendar slots when the inbound email looks like a scheduling request", async () => {
    dbMock.fetchPendingInboxMessages.mockResolvedValue([
      { id: "m2", from_email: "jane@example.com", subject: "Can we schedule a time?", body: "Looking to book an appointment next week." },
    ]);
    kaiMock.submitBatch.mockImplementation((inputs: unknown[]) =>
      Promise.resolve(inputs.map(() => loopResult("Happy to help — here are a few times.")))
    );

    await runHeartbeat();

    expect(dbMock.proposeCalendarSlots).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: "jane@example.com", purpose: "Can we schedule a time?" })
    );
  });

  it("skips submitting a draft when the sub-agent produced no output", async () => {
    dbMock.fetchPendingInboxMessages.mockResolvedValue([
      { id: "m3", from_email: "owner@acme.com", subject: "Hi", body: "Hello" },
    ]);
    kaiMock.submitBatch.mockResolvedValue([loopResult("")]);

    await runHeartbeat();

    expect(dbMock.submitInboxDraft).not.toHaveBeenCalled();
  });
});

describe("runHeartbeat: sms drafting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drafts a reply for each pending text and submits it", async () => {
    dbMock.fetchPendingSms.mockResolvedValue([{ id: "s1", phone: "+15550001111", body: "Are you open Saturday?" }]);
    kaiMock.submitBatch.mockImplementation((inputs: unknown[]) =>
      Promise.resolve(inputs.map(() => loopResult("Yes, 9-2 on Saturdays!")))
    );

    await runHeartbeat();

    expect(dbMock.submitSmsDraft).toHaveBeenCalledWith("s1", "Yes, 9-2 on Saturdays!");
  });

  it("proposes calendar slots when the inbound text looks like a scheduling request", async () => {
    dbMock.fetchPendingSms.mockResolvedValue([
      { id: "s2", phone: "+15550002222", body: "Can I book an appointment for Tuesday?" },
    ]);
    kaiMock.submitBatch.mockImplementation((inputs: unknown[]) =>
      Promise.resolve(inputs.map(() => loopResult("Sure — here are some open slots.")))
    );

    await runHeartbeat();

    expect(dbMock.proposeCalendarSlots).toHaveBeenCalledWith(
      expect.objectContaining({ contactPhone: "+15550002222" })
    );
  });
});

describe("runHeartbeat: overall cycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("still records a heartbeat even when a step throws", async () => {
    dbMock.fetchUnscoredLeads.mockRejectedValueOnce(new Error("backend unreachable"));

    await runHeartbeat();

    expect(alertsMock.alertFounder).toHaveBeenCalledWith(expect.stringContaining("backend unreachable"));
    expect(dbMock.recordHeartbeat).toHaveBeenCalled();
  });

  it("calls triggerNightlyReport once per cycle", async () => {
    await runHeartbeat();
    expect(dbMock.triggerNightlyReport).toHaveBeenCalledTimes(1);
  });
});
