# Your Night Desk Agent

This is your own copy of the Night Desk agent, running on your own computer.
What it can do depends on your plan:

| Plan | Runs | Daily task cap |
|---|---|---|
| Starter | Front Desk (calls/texts/inbox drafting) | 40 |
| Core | + Sales Ledger, Back Office (calendar, invoicing, CRM notes) | 150 |
| Scale | + Night Report (daily/weekly summaries) | 500 |

Your `.env` already has your plan and a unique key stamped in — you don't
need to touch those. Want a higher plan's lanes and cap? Upgrade from your
account and download a fresh copy; this one won't quietly unlock more on
its own.

## First run

```bash
npm install
npm start
```

The first time you run `npm start`, there's no business profile yet, so it
opens a small local setup wizard instead of the agent itself:

```
Setup wizard running — open http://localhost:4090 in your browser to finish setup.
```

Open that link, fill in your business (hours, services, tone, pricing
notes), and paste in an Anthropic API key — get one free at
[console.anthropic.com](https://console.anthropic.com) if you don't have
one. Everything you type stays on this machine; none of it is sent to
Night Desk's servers.

When you save, stop the wizard (`Ctrl+C` in the terminal) and run
`npm start` again. This time it finds your saved profile and key and
launches the actual agent instead.

## What it actually does

On an interval (`HEARTBEAT_INTERVAL_MINUTES` in `.env`, default 15), the
agent checks `data/inbound/<lane>.json` for anything that doesn't have a
drafted reply yet, and drafts one — in your business's voice, using the
profile you filled in. Each file ships with one example item so you can
see it work immediately.

**Everything it produces is a draft, nothing sends itself.** Open
`data/inbound/front-desk.json` (or `sales-ledger.json`, `back-office.json`)
after a cycle runs and you'll see a `draftedReply` field appended to each
item — review it, then send it yourself however you'd normally reach that
person. This mirrors the same boundary the hosted Night Desk product holds
to everywhere: the agent drafts, a human sends.

If your plan includes Night Report, a summary gets written to
`data/reports/<date>.md` once a day (after 8pm local time) — how many
items got drafted, by which lane.

### Adding real work for it to do

Edit `data/inbound/<lane>.json` directly and add entries in this shape:

```json
{ "id": "some-unique-id", "contact": "customer@example.com", "subject": "Their question", "body": "What they actually said" }
```

The agent picks up anything in that file without a `draftedReply` yet on
its next cycle.

### Connecting real inboxes/calendars/invoicing

This package doesn't wire up Gmail, Google Calendar, Twilio, or Stripe
Invoices on its own — it's a local drafting loop, not a full integration
suite. Night Desk's hosted backend (`backend/src/lib/gmail.ts`,
`calendar.ts`, `sms.ts`, `invoicing.ts` in the main repo) has real,
working versions of all four if you want to build that wiring into your
own copy — the pattern is: pull real messages into
`data/inbound/<lane>.json` on a schedule, and read `draftedReply` back out
once you approve it.

## Daily cap

Your plan's daily task cap (see the table above) is enforced locally in
`data/state.json` — once you hit it, the agent stops drafting new items
until the next calendar day (local time) and just waits. It doesn't ask
Night Desk's servers for permission each time; there's nothing to call
home to.

## Troubleshooting

- **"invalid x-api-key" in the logs** — your Anthropic key is wrong or
  expired. Delete the `ANTHROPIC_API_KEY=` line in `.env`, run
  `npm start` again, and it'll fall back to the setup wizard so you can
  paste in a fresh one.
- **Nothing seems to happen** — check `data/inbound/*.json` for the lanes
  your plan unlocks; if every item already has a `draftedReply`, there's
  nothing new to draft. Add a new item to see it work again.
- **Re-downloaded and lost your profile** — your business profile and
  drafts live in `data/`, not in the download itself. Copy that folder
  over from the old install if you want to keep it.
