import { describe, expect, it } from "vitest";
import { calculateRoi, RECLAIM_RATE, WEEKS_PER_YEAR } from "./roi";

describe("calculateRoi", () => {
  it("applies the stated reclaim rate to weekly hours", () => {
    const result = calculateRoi(20, 50);
    expect(result.weeklyHoursReclaimed).toBeCloseTo(20 * RECLAIM_RATE, 5);
  });

  it("annualizes reclaimed hours across a full year", () => {
    const result = calculateRoi(20, 50);
    expect(result.annualHoursReclaimed).toBe(Math.round(20 * RECLAIM_RATE * WEEKS_PER_YEAR));
  });

  it("multiplies annual hours by the entered hourly rate for the dollar estimate", () => {
    const result = calculateRoi(10, 100);
    expect(result.annualDollarValue).toBe(result.annualHoursReclaimed * 100);
  });

  it("never goes negative for negative or zero inputs", () => {
    const result = calculateRoi(-5, -20);
    expect(result.weeklyHoursReclaimed).toBe(0);
    expect(result.annualHoursReclaimed).toBe(0);
    expect(result.annualDollarValue).toBe(0);
  });

  it("returns zero reclaimed time for zero hours regardless of rate", () => {
    const result = calculateRoi(0, 500);
    expect(result.annualDollarValue).toBe(0);
  });
});
