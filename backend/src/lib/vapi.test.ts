import { describe, expect, it } from "vitest";
import { ALLOWED_ASSISTANTS, assertAllowedAssistant, startColdCall, VapiScopeError } from "./vapi.js";

describe("assertAllowedAssistant", () => {
  it("allows the Cold Call assistant", () => {
    expect(() => assertAllowedAssistant(ALLOWED_ASSISTANTS.coldCall)).not.toThrow();
  });

  it("allows the Website Demo assistant", () => {
    expect(() => assertAllowedAssistant(ALLOWED_ASSISTANTS.websiteDemo)).not.toThrow();
  });

  it("refuses any other assistant id", () => {
    expect(() => assertAllowedAssistant("some-other-assistant-id")).toThrow(VapiScopeError);
  });
});

describe("startColdCall (mock mode — no VAPI_PRIVATE_API_KEY in test env)", () => {
  it("returns a mock call without making a real network request", async () => {
    const result = await startColdCall({ prospectPhone: "+15551234567", prospectName: "Test Auto Shop" });

    expect(result.mock).toBe(true);
    expect(result.status).toBe("queued");
    expect(result.vapiCallId).toMatch(/^mock_call_/);
  });

  it("generates a distinct call id per call", async () => {
    const first = await startColdCall({ prospectPhone: "+15551234567", prospectName: "Shop A" });
    const second = await startColdCall({ prospectPhone: "+15557654321", prospectName: "Shop B" });
    expect(first.vapiCallId).not.toBe(second.vapiCallId);
  });
});
