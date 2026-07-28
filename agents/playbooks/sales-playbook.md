# Sales Playbook — Waitlist to Close

Feeds `Scout` (qualifying leads) and `Wordsmith` (drafting outreach and
follow-up). Mirrors the pre-sell/validation model: nothing here assumes a
built product exists before a deposit is collected.

## Funnel stages

1. **Waitlist signup** (`/waitlist` on the frontend) — top of funnel,
   zero friction, just email + business context.
2. **Pre-qualification** — the waitlist form itself captures qualification
   fields (see `frontend/components/WaitlistForm.tsx`): monthly revenue
   band, team size, current biggest time-sink, tier interest. Scout scores
   this 0–100 using the rubric below and writes the score back via
   `POST /api/agents/lead-score`.
3. **Deposit** — qualified leads (score ≥ 60) are shown the Stripe deposit
   checkout ($200 deposit, credited against first month) via
   `backend/src/routes/checkout.ts`. This is the "collect a deposit before
   building anything" step from the Pre-Sell strategy.
4. **Onboarding call** — founder-run, not automated. Scout preps a one-page
   brief before the call (`generateLeadBrief`) summarizing the
   pre-qualification answers so the founder never opens a call cold.
5. **Subscription conversion** — after the call, the client is sent the
   tier checkout link matching what was agreed (`$500`, `$1,000`, or
   `$10,000` recurring Stripe Price).

## Lead scoring rubric (used by Scout)

| Signal | Points |
|---|---|
| Monthly revenue ≥ $80k | 25 |
| Team size 5–50 | 20 |
| Named a specific, recurring time-sink (not vague) | 20 |
| Selected Core or Scale tier interest | 20 |
| Referred by an existing client | 15 |

Score ≥ 60 → deposit checkout shown immediately.
Score 30–59 → routed to nurture sequence (Wordsmith drafts, founder
approves before send — Starter-tier leads stay async per `user.md`).
Score < 30 → waitlisted, no active outreach, re-scored if they update
their answers.

## Decoy pricing framing (what Wordsmith should always do in copy)

Always present all three tiers together. Never quote Core in isolation.
The Scale tier ($10,000/mo) exists to anchor — Wordsmith should describe
its scope generously (dedicated team, weekly calls, custom integration)
so Core reads as the obvious value pick, not the cheap option.

## Guarantee language (approved, do not modify without founder sign-off)

"If we haven't shipped your first working agent inside 14 days of
kickoff, that month is free." This is the only guarantee agents are
authorized to state. Never invent a stronger guarantee to close a deal.
