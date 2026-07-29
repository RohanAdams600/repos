import { describe, expect, it } from "vitest";
import { fetchUnreadEmails, isGmailConfigured, sendEmailReply } from "./gmail.js";

// GMAIL_* env vars are unset in the test environment (test/setup.ts
// doesn't set them) — this is the default, unconfigured state.
describe("gmail (mock mode)", () => {
  it("is not configured without GMAIL_* env vars", () => {
    expect(isGmailConfigured).toBe(false);
  });

  it("returns a stable sample inbox instead of making a real API call", async () => {
    const first = await fetchUnreadEmails();
    const second = await fetchUnreadEmails();

    expect(first.length).toBeGreaterThan(0);
    expect(first.map((m) => m.externalId)).toEqual(second.map((m) => m.externalId));
  });

  it("logs instead of delivering a reply", async () => {
    const result = await sendEmailReply({ threadId: "t1", to: "owner@acme.com", subject: "Hi", body: "Thanks!" });
    expect(result.mock).toBe(true);
  });
});
