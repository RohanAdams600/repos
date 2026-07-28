import { describe, expect, it } from "vitest";
import { parseWardenVerdict } from "./review-agent.js";

describe("parseWardenVerdict", () => {
  it("parses a well-formed PASS verdict", () => {
    const result = parseWardenVerdict(
      "VERDICT: PASS\nNOTES: Satisfies the Definition of Done and the style guide.\nRETRY_RECOMMENDED: no"
    );
    expect(result).toEqual({
      passed: true,
      notes: "Satisfies the Definition of Done and the style guide.",
      retryRecommended: false,
    });
  });

  it("parses a well-formed FAIL verdict recommending a retry", () => {
    const result = parseWardenVerdict(
      "VERDICT: FAIL\nNOTES: Violates the pricing framing rule — quoted Core in isolation.\nRETRY_RECOMMENDED: yes"
    );
    expect(result.passed).toBe(false);
    expect(result.retryRecommended).toBe(true);
    expect(result.notes).toContain("pricing framing");
  });

  it("is case-insensitive on the verdict and retry tokens", () => {
    const result = parseWardenVerdict("verdict: pass\nnotes: fine\nretry_recommended: NO");
    expect(result.passed).toBe(true);
    expect(result.retryRecommended).toBe(false);
  });

  it("treats an unparseable response as a FAIL rather than silently passing", () => {
    const result = parseWardenVerdict("I think this looks good overall.");
    expect(result.passed).toBe(false);
    expect(result.notes).toMatch(/unparseable/i);
  });
});
