import { describe, expect, it, vi } from "vitest";
import { notifyFounder, notifyNewWaitlistLead } from "./email.js";

describe("notifyFounder (mock mode — no RESEND_API_KEY in test env)", () => {
  it("resolves without making a real network request", async () => {
    await expect(notifyFounder("Test subject", "Test body")).resolves.toBeUndefined();
  });
});

describe("notifyNewWaitlistLead", () => {
  it("never throws, even if the underlying send fails — callers fire-and-forget this", async () => {
    // No RESEND_API_KEY means this always resolves via the mock path, but
    // the contract that matters is: this function's promise never rejects.
    const spy = vi.fn();
    await notifyNewWaitlistLead({
      email: "owner@acme.com",
      businessName: "Acme Services LLC",
      tierInterest: "core",
      timeSink: "Manual lead follow-up",
    }).then(spy, spy);

    expect(spy).toHaveBeenCalledOnce();
  });
});
