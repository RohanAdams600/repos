import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { DATA_DIR } from "../lib/paths.js";
import { saveQueue } from "./queue.js";
import { loadState, saveState } from "../lib/state.js";
import type { BusinessProfile } from "../lib/profile.js";

const anthropicMock = vi.hoisted(() => ({
  complete: vi.fn(),
  MODELS: { SONNET: "claude-sonnet-5", OPUS: "claude-opus-5" },
}));
vi.mock("../lib/anthropic-client.js", () => anthropicMock);

const { runLane } = await import("./run-lane.js");

const PROFILE: BusinessProfile = {
  businessName: "Riverside Plaza HVAC",
  hours: "Mon-Fri 8-6",
  services: "AC repair",
  pricingNotes: "",
  tone: "friendly",
  contactEmail: "owner@riverside.example",
  contactPhone: "555-0100",
};

describe("runLane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("drafts a reply for every pending item and writes it back to the queue", async () => {
    saveQueue("front-desk", [
      { id: "1", contact: "a@example.com", subject: "Hours?", body: "When are you open?" },
      { id: "2", contact: "b@example.com", subject: "Quote", body: "How much for a repair?" },
    ]);
    anthropicMock.complete.mockResolvedValue({ text: "We're open 8-6 weekdays!", tokensIn: 10, tokensOut: 5 });

    const result = await runLane({ lane: "front-desk", roleBlock: "You are front desk.", profile: PROFILE, tier: "core" });

    expect(result.processed).toBe(2);
    expect(result.skippedAtCapacity).toBe(false);
    expect(anthropicMock.complete).toHaveBeenCalledTimes(2);

    const state = loadState();
    expect(state.tasksProcessedToday).toBe(2);
  });

  it("skips items that already have a drafted reply", async () => {
    saveQueue("front-desk", [{ id: "1", contact: "a", subject: "s", body: "b", draftedReply: "already done" }]);

    const result = await runLane({ lane: "front-desk", roleBlock: "role", profile: PROFILE, tier: "core" });

    expect(result.processed).toBe(0);
    expect(anthropicMock.complete).not.toHaveBeenCalled();
  });

  it("stops drafting once the daily cap is reached, leaving the rest pending", async () => {
    saveState({ date: new Date().toISOString().slice(0, 10), tasksProcessedToday: 40, log: [] }); // starter cap is 40
    saveQueue("front-desk", [{ id: "1", contact: "a", subject: "s", body: "b" }]);
    anthropicMock.complete.mockResolvedValue({ text: "reply", tokensIn: 1, tokensOut: 1 });

    const result = await runLane({ lane: "front-desk", roleBlock: "role", profile: PROFILE, tier: "starter" });

    expect(result.processed).toBe(0);
    expect(result.skippedAtCapacity).toBe(true);
    expect(anthropicMock.complete).not.toHaveBeenCalled();
  });

  it("catches a failed Anthropic call instead of throwing, and leaves the item pending for next cycle", async () => {
    saveQueue("front-desk", [
      { id: "1", contact: "a@example.com", subject: "s1", body: "b1" },
      { id: "2", contact: "b@example.com", subject: "s2", body: "b2" },
    ]);
    anthropicMock.complete
      .mockRejectedValueOnce(new Error("invalid x-api-key"))
      .mockResolvedValueOnce({ text: "reply", tokensIn: 1, tokensOut: 1 });

    const result = await runLane({ lane: "front-desk", roleBlock: "role", profile: PROFILE, tier: "core" });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(anthropicMock.complete).toHaveBeenCalledTimes(2);

    const saved = JSON.parse(fs.readFileSync(`${DATA_DIR}/inbound/front-desk.json`, "utf8"));
    expect(saved[0].draftedReply).toBeUndefined(); // the failed one stays pending
    expect(saved[1].draftedReply).toBe("reply");
  });

  it("passes a custom model through to complete() when given one", async () => {
    saveQueue("back-office", [{ id: "1", contact: "owner", subject: "Invoice", body: "bill this" }]);
    anthropicMock.complete.mockResolvedValue({ text: "draft invoice", tokensIn: 1, tokensOut: 1 });

    await runLane({ lane: "back-office", roleBlock: "role", profile: PROFILE, tier: "core", model: "claude-opus-5" });

    expect(anthropicMock.complete).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-5" }));
  });
});
