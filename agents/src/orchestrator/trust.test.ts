import { describe, expect, it } from "vitest";
import { crossesHardBoundary, requiresApproval } from "./trust.js";

describe("crossesHardBoundary", () => {
  it.each([
    "Issue a refund to the customer for the duplicate charge",
    "Please change the subscription price for this client",
    "Cancel the meeting on the founder's calendar",
    "Delete the production database table",
    "Send this update to all clients",
  ])("flags %s", (summary) => {
    expect(crossesHardBoundary(summary)).toBe(true);
  });

  it.each([
    "Draft a kickoff email for the new Core client",
    "Score this inbound lead against the rubric",
    "Fix the failing test in the checkout route",
    "Review Wordsmith's draft against the style guide",
  ])("does not flag %s", (summary) => {
    expect(crossesHardBoundary(summary)).toBe(false);
  });
});

describe("requiresApproval", () => {
  it("always requires approval in manual stage, regardless of risk", () => {
    for (const riskLevel of ["low", "medium", "high"] as const) {
      expect(
        requiresApproval({ trustStage: "manual", riskLevel, agent: "scout", crossesHardBoundary: false })
      ).toBe(true);
    }
  });

  it("supervised stage auto-executes only low-risk work", () => {
    expect(
      requiresApproval({ trustStage: "supervised", riskLevel: "low", agent: "scout", crossesHardBoundary: false })
    ).toBe(false);
    expect(
      requiresApproval({ trustStage: "supervised", riskLevel: "medium", agent: "wordsmith", crossesHardBoundary: false })
    ).toBe(true);
    expect(
      requiresApproval({ trustStage: "supervised", riskLevel: "high", agent: "patch", crossesHardBoundary: false })
    ).toBe(true);
  });

  it("autonomous stage still gates high-risk work", () => {
    expect(
      requiresApproval({ trustStage: "autonomous", riskLevel: "low", agent: "scout", crossesHardBoundary: false })
    ).toBe(false);
    expect(
      requiresApproval({ trustStage: "autonomous", riskLevel: "medium", agent: "wordsmith", crossesHardBoundary: false })
    ).toBe(false);
    expect(
      requiresApproval({ trustStage: "autonomous", riskLevel: "high", agent: "patch", crossesHardBoundary: false })
    ).toBe(true);
  });

  it("a hard boundary always requires approval, even in autonomous stage with low risk", () => {
    expect(
      requiresApproval({ trustStage: "autonomous", riskLevel: "low", agent: "scout", crossesHardBoundary: true })
    ).toBe(true);
  });
});
