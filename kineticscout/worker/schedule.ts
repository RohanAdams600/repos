/**
 * Agent schedules. Expressed in AGENT_TIMEZONE so "Tuesday 10:00" means 10:00 local time year-round.
 */
export const AGENT_SCHEDULES = {
  /** Growth and Ad agent: Tuesdays and Thursdays at 10:00. */
  growth: '0 10 * * 2,4',
  /** Data and SEO agent: Sundays at 00:00. */
  seo: '0 0 * * 0',
  /** Agent 3: daily program data feed import (only when PROGRAM_DATA_FEED_URL is set). */
  programFeed: '15 6 * * *',
  /** Reconciliation sweep for stuck uploads and analyses. */
  sweep: '*/10 * * * *',
} as const

/**
 * Deterministic slot id for a scheduled run, e.g. "2026-10-06T10:00", in the schedule's time zone.
 * Every worker replica computes the same id for the same tick, which makes the enqueue idempotent.
 */
export function scheduleSlot(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
