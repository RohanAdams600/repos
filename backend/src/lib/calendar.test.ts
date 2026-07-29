import { describe, expect, it } from "vitest";
import { createCalendarEvent, isCalendarConfigured, proposeAvailableSlots } from "./calendar.js";

describe("calendar (mock mode)", () => {
  it("is not configured without GOOGLE_CALENDAR_* env vars", () => {
    expect(isCalendarConfigured).toBe(false);
  });

  it("proposes the requested number of slots, all in the future", async () => {
    const now = Date.now();
    const slots = await proposeAvailableSlots(30, 3);

    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(new Date(slot).getTime()).toBeGreaterThan(now);
    }
  });

  it("never proposes a weekend slot", async () => {
    const slots = await proposeAvailableSlots(30, 5);
    for (const slot of slots) {
      const day = new Date(slot).getDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    }
  });

  it("logs instead of booking a real event", async () => {
    const result = await createCalendarEvent({
      summary: "Kickoff call",
      description: "test",
      startIso: new Date(Date.now() + 86_400_000).toISOString(),
      durationMinutes: 30,
    });
    expect(result.mock).toBe(true);
    expect(result.googleEventId).toBeNull();
  });
});
