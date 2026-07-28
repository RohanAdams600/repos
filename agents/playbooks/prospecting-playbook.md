# Prospecting Playbook — Outbound Sales Engine

Feeds the `prospects` table (`backend/db/schema.sql`) and the founder
dashboard's Prospects tab, where a human approves every outbound call
before the "Autonoma Cold Call" Vapi assistant places it — see
`identity.md` boundary #6. This file defines *who's a good target* so
Scout can score real businesses consistently, and so the founder isn't
guessing at criteria each time a new prospect comes in.

## Why this ICP (Ideal Customer Profile)

The Core offer solves a specific shape of pain: an owner who's personally
in the loop on repetitive operational work because there's no one else to
delegate it to, and losing revenue when they're not available to handle
it live. That shape shows up hardest in small, local, service-based
businesses — which is also exactly who's easiest to reach by phone,
because they answer their own phone.

## Scoring criteria (mirrors the sales-playbook lead-scoring rubric)

| Signal | Points |
|---|---|
| Team size 1-4 (owner-operated or near it) | 25 |
| Limited hours — closes early, closed weekends, or no after-hours coverage | 25 |
| Phone-dependent intake (bookings/inquiries come in by call, not just online) | 20 |
| Single location (not a franchise with corporate support) | 15 |
| Service-based, not pure retail (repair, maintenance, appointments) | 15 |

Score ≥ 60 → good fit for the cold-call program.
Score 30-59 → fine for the DIY/Starter tier positioning, lower call priority.
Score < 30 → not a fit for outbound right now.

## Flagship example: independent automotive repair shops

The example that best fits this ICP end to end: a single-location auto
repair shop, 2-5 employees, closes at 5 or 6pm, no answering service.
Every call after close, every walk-in-turned-voicemail, is a missed
booking — and the owner is usually the one who'd otherwise be fixing that
by working later. The same shape applies to independent HVAC and
plumbing shops, small salons/barbershops, single-location
dental/chiropractic practices, and boutique fitness studios. The common
thread isn't the industry — it's "the owner personally absorbs the cost
of being unavailable."

## How prospects get into the table — sourcing rules

**Never fabricate a business record.** A prospect row that doesn't
correspond to a real business with a real phone number isn't a
shortcut — it's a call that either fails or, worse, reaches a random
person. Every row's `source` field says how it was found:

- `manual` — the founder found and entered it directly (Google Maps,
  local directories, personal knowledge of the area).
- `scout_research` — Scout compiled it from a specific, citable source
  (a business directory, a chamber of commerce list, a review platform)
  for a founder-specified city/region and vertical. Scout always cites
  where a prospect came from in `fit_reasoning` alongside the ICP
  reasoning — never just "found online."
- `referral` — came from an existing client or contact.

If Scout is asked to prospect a city/vertical it has no real source data
for, the correct output is "I don't have a reliable source for this —
here's how to get one" (e.g., a specific directory to pull from), not a
plausible-sounding list of made-up businesses.

## What happens after a row exists

1. Founder reviews the row in the dashboard's Prospects tab and sets
   status to `approved` (or `not_interested` to skip it).
2. Founder clicks "Start Cold Call" — this is the human-approval step
   required by identity.md boundary #6. It calls
   `POST /api/vapi/cold-call/:prospectId`, which is gated by the same
   dashboard token that gates the rest of the founder's tools — there is
   no path for an agent to trigger this on its own.
3. The call is placed by the "Autonoma Cold Call" Vapi assistant, logged
   to `cold_calls`, and the prospect's status moves to `calling`, then the
   founder updates it to `called` / `interested` / `not_interested` /
   `converted` based on the outcome.

## What Wordsmith can help with

Drafting the cold-call assistant's talking points and objection-handling
script (as text, reviewed by the founder before being configured into the
Vapi assistant) — following `voice-style-guide.md` and the sales
playbook's objection-handling pattern: acknowledge in one clause, pivot to
a specific proof point, end with a low-friction next step.
