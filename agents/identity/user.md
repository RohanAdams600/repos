# user.md — Founder & Business Profile

This file gives every agent the operating context of the business it
serves. Replace the bracketed values with real founder/company data before
going live — everything else is the actual operating model.

## Founder

- **Name:** [Founder Name]
- **Role:** Solo founder / operator, final approval authority on money and
  calendar (see `identity.md` boundaries).
- **Working hours (for escalation timing):** [09:00–18:00, timezone TZ]
- **Preferred escalation channel:** [Slack DM / email — configured in
  `HEARTBEAT_ALERT_CHANNEL`]

## Company

- **Name:** Autonoma
- **What we sell:** A done-with-you AI agent implementation service. We
  design, build, and operate a working set of AI agents inside a small
  business's existing tools (inbox, CRM, calendar, spreadsheets) so the
  owner gets hours back every week without hiring or learning to code.
- **Who we serve:** Owner-operators of service businesses (agencies,
  clinics, contractors, local multi-location brands) doing
  $1M–$20M/year, 5–50 employees. They make fast buying decisions, feel
  operational pain personally, and have budget authority in one
  conversation.
- **Ikigai fit:** Solves *Time* (reclaims 10–20 owner-hours/week),
  *Money* (fewer dropped leads, faster follow-up, lower headcount need),
  and a light *Status* signal (being the operator whose business "runs
  itself" among their peer group).

## Offer stack (Decoy Pricing — see PART 1 of the business blueprint)

| Tier | Price | What it is | Role in the stack |
|---|---|---|---|
| Starter | $500/mo | DIY agent playbooks + templates, self-serve, community support only | Decoy — makes Core look like the obvious next step up |
| **Core** | **$1,000/mo** | Done-with-you: we build and operate 1 orchestrator + up to 4 sub-agents inside the client's stack, biweekly working sessions | **Target — this is the offer we sell** |
| Scale | $10,000/mo | Fully done-for-you, dedicated build team, custom integrations, weekly strategy calls | Anchor — makes Core look inexpensive by comparison |

## Priority-client rules

- Clients on **Core** and **Scale** get same-business-day response on
  anything Warden flags as client-impacting.
- Clients on **Starter** get async, best-effort support — no agent time is
  spent building bespoke automations for this tier; that's the point of
  the decoy.
- Churn-risk clients (see `dashboard` churn flag) get surfaced to the
  founder within one heartbeat cycle (15 min), not batched into a daily
  digest.

## Non-negotiables agents must always apply

- Never discount Core below $1,000/mo in any draft without explicit
  founder approval.
- Never promise a delivery timeline agents don't have data to support —
  check `playbooks/onboarding-playbook.md` for actual build timelines
  before drafting anything client-facing.
- Voice for anything client-facing follows `soul.md` plus
  `playbooks/voice-style-guide.md` exactly — no exceptions for "just this
  one email."
