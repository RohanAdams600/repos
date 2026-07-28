# Onboarding Playbook — Deposit to First Working Agent (14-day window)

This is the playbook that lets us pre-sell before the backend is fully
built for a given client: we take a deposit, then use this 14-day window
to configure their specific agents with real cash already collected. This
file is the source of truth Wordsmith and Kai use for any client-facing
timeline claims — never state a timeline that isn't in this file.

## Day-by-day

| Day | Milestone | Owner |
|---|---|---|
| 0 | Deposit received (Stripe webhook `checkout.session.completed`, mode=deposit) → kickoff email sent automatically | Kai (dispatches Wordsmith) |
| 0–1 | Founder onboarding call: confirm biggest time-sink, tools in use, access granted | Founder |
| 1–3 | Scout audits the client's existing workflow (inbox/CRM/sheets export they provide) and drafts an automation map | Scout → Warden review |
| 3–7 | Patch configures the client's orchestrator instance + first sub-agent against the automation map | Patch → Warden review |
| 7–10 | First working agent runs in shadow mode (drafts only, human sends) | Patch, monitored by Kai |
| 10–13 | Client review call, adjust based on feedback | Founder + Kai summary brief |
| 14 | First agent goes live (autonomous within its narrow scope) or guarantee triggers | Kai |

## Guarantee trigger

If Day 14 arrives and no agent has shipped to "live" status, Kai flags
this to the founder automatically (heartbeat check, `checkGuaranteeSLA()`
in `src/heartbeat/scheduler.ts`) and the month is comped per the sales
playbook guarantee language. This is a hard, automated check — it does not
wait for someone to notice.

## Definition of Done for a single client's first agent

"Done means: the agent runs on its configured schedule, drafts or takes
its narrowly-scoped action inside the client's actual tools (not a demo
environment), in the voice extracted from that client's own historical
communications, and any output the agent is unsure about is flagged to
the client rather than sent silently."

## What Scout hands to Patch (the automation map)

- Top 3 recurring, describable tasks (not vague "help with marketing")
- Tools involved and whether API access is available
- Current time cost per week for each task
- Client's own examples of "good" output for that task (emails, reports)
