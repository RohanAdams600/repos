/**
 * Pure calculation, kept separate from the component so it's directly
 * testable. This is a stated assumption (70% of manual time reclaimed),
 * not a claimed average across real clients — Autonoma doesn't have
 * enough clients yet to honestly report an empirical average, and the
 * calculator says so in its own copy (see ROICalculator.tsx).
 */
export const RECLAIM_RATE = 0.7;
export const WEEKS_PER_YEAR = 52;

export interface RoiResult {
  weeklyHoursReclaimed: number;
  annualHoursReclaimed: number;
  annualDollarValue: number;
}

export function calculateRoi(hoursPerWeek: number, hourlyRate: number): RoiResult {
  const safeHours = Math.max(0, hoursPerWeek);
  const safeRate = Math.max(0, hourlyRate);

  const weeklyHoursReclaimed = Math.round(safeHours * RECLAIM_RATE * 10) / 10;
  const annualHoursReclaimed = Math.round(weeklyHoursReclaimed * WEEKS_PER_YEAR);
  const annualDollarValue = Math.round(annualHoursReclaimed * safeRate);

  return { weeklyHoursReclaimed, annualHoursReclaimed, annualDollarValue };
}
