/**
 * Google Calendar — the "calendar" claim. Runs in mock mode (returns
 * plausible near-future slots, logs instead of booking) until all three
 * GOOGLE_CALENDAR_* credentials are set. Reading/proposing is
 * unrestricted (Scout's lane — see agents/playbooks); actually creating
 * an event is identity.md boundary #2 territory and is only ever called
 * from the founder-gated route in routes/calendar.ts — no agent path
 * reaches createCalendarEvent directly.
 */
import { env } from "./env.js";
import { getGoogleAccessToken } from "./google-oauth.js";
import { logger } from "./logger.js";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const BUSINESS_HOURS = { startHour: 9, endHour: 17 }; // 9am-5pm, slot proposals stay inside this window

export const isCalendarConfigured = Boolean(
  env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.GOOGLE_CALENDAR_REFRESH_TOKEN
);

async function calendarAccessToken(): Promise<string> {
  return getGoogleAccessToken({
    clientId: env.GOOGLE_CALENDAR_CLIENT_ID!,
    clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
  });
}

interface BusyInterval {
  start: string;
  end: string;
}

async function fetchBusyIntervals(timeMin: Date, timeMax: Date): Promise<BusyInterval[]> {
  const token = await calendarAccessToken();
  const response = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: env.GOOGLE_CALENDAR_ID }],
    }),
  });
  if (!response.ok) throw new Error(`Google Calendar freeBusy failed: ${response.status}`);
  const data = (await response.json()) as { calendars: Record<string, { busy: BusyInterval[] }> };
  return data.calendars[env.GOOGLE_CALENDAR_ID]?.busy ?? [];
}

function overlaps(slotStart: Date, slotEnd: Date, busy: BusyInterval[]): boolean {
  return busy.some((b) => slotStart < new Date(b.end) && slotEnd > new Date(b.start));
}

/**
 * Proposes up to `count` open slots of `durationMinutes` within business
 * hours over the next 5 weekdays. Read-only — never books anything.
 */
export async function proposeAvailableSlots(durationMinutes = 30, count = 3): Promise<string[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  if (!isCalendarConfigured) {
    logger.info("[mock calendar] proposing sample slots — set GOOGLE_CALENDAR_* env vars for real availability");
    return mockSlots(durationMinutes, count);
  }

  const busy = await fetchBusyIntervals(now, horizon);
  const slots: string[] = [];

  for (let dayOffset = 1; dayOffset <= 6 && slots.length < count; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends

    for (let hour = BUSINESS_HOURS.startHour; hour < BUSINESS_HOURS.endHour && slots.length < count; hour++) {
      const slotStart = new Date(day);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      if (!overlaps(slotStart, slotEnd, busy)) {
        slots.push(slotStart.toISOString());
      }
    }
  }

  return slots;
}

function mockSlots(durationMinutes: number, count: number): string[] {
  const slots: string[] = [];
  const now = new Date();
  let dayOffset = 1;
  while (slots.length < count) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    dayOffset++;
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    day.setHours(10 + slots.length * 2, 0, 0, 0);
    slots.push(day.toISOString());
  }
  return slots.slice(0, count);
}

export interface BookEventResult {
  mock: boolean;
  googleEventId: string | null;
}

/** Only ever called from the founder-gated booking route — never from an agent task. */
export async function createCalendarEvent(input: {
  summary: string;
  description: string;
  startIso: string;
  durationMinutes: number;
  attendeeEmail?: string;
}): Promise<BookEventResult> {
  if (!isCalendarConfigured) {
    logger.info({ summary: input.summary, start: input.startIso }, "[mock calendar] would book event");
    return { mock: true, googleEventId: null };
  }

  const token = await calendarAccessToken();
  const start = new Date(input.startIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60 * 1000);

  const response = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Calendar event creation failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { id: string };
  return { mock: false, googleEventId: data.id };
}
