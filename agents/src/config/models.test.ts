import { describe, expect, it } from "vitest";
import { MODELS, SUB_AGENT_DEFAULT_MODEL, selectModelForTask } from "./models.js";

describe("selectModelForTask", () => {
  it("routes high-volume lead-score tasks to Haiku regardless of agent or risk", () => {
    expect(selectModelForTask("scout", "lead-score", "low")).toBe(MODELS.HAIKU);
    expect(selectModelForTask("scout", "lead-score", "high")).toBe(MODELS.HAIKU);
  });

  it("routes any high-risk task to Opus even for an agent that defaults to Sonnet", () => {
    expect(selectModelForTask("patch", "code", "high")).toBe(MODELS.OPUS);
  });

  it("falls back to each sub-agent's configured default for normal-risk work", () => {
    expect(selectModelForTask("scout", "research", "low")).toBe(SUB_AGENT_DEFAULT_MODEL.scout);
    expect(selectModelForTask("wordsmith", "content", "medium")).toBe(SUB_AGENT_DEFAULT_MODEL.wordsmith);
  });

  it("Warden defaults to Opus for its QA gate role", () => {
    expect(SUB_AGENT_DEFAULT_MODEL.warden).toBe(MODELS.OPUS);
  });
});
