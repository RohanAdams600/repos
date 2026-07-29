import { describe, expect, it } from "vitest";
import { isTwilioConfigured, sendSms } from "./sms.js";

describe("sms (mock mode)", () => {
  it("is not configured without TWILIO_* env vars", () => {
    expect(isTwilioConfigured).toBe(false);
  });

  it("logs instead of sending a real text", async () => {
    const result = await sendSms({ to: "+15551234567", body: "See you Thursday!" });
    expect(result.mock).toBe(true);
    expect(result.twilioSid).toBeNull();
  });
});
