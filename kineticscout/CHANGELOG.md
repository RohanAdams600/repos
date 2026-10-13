# Changelog

## 1.0.0 (release candidate, 2026-10-13)

The first version intended for production. It is ready to deploy once the blocking items in
[docs/LAUNCH.md](docs/LAUNCH.md) are done; none of them is code.

### Launch readiness (Phase 8)

- Authorization test over every API procedure for each kind of account.
- Migration that turns on row-level security for the migrations table, fails if any table is left
  without it, revokes Data API grants and fixes the search path of database functions.
- Fixed: the language switch accepted a return path with a tab or newline that browsers turn into a
  link to another site.
- Fixed: pages rendered for PUT, PATCH, DELETE and OPTIONS; they now answer 405.
- Fixed: on phones, every athlete dashboard page, the recruiting calendar and some Family and
  Spanish pages scrolled sideways. The dashboard menu and wide tables now scroll inside their own
  boxes, and button labels wrap. A new end-to-end test checks every page at 360px in both languages.
- Fixed: an analysis report failed to load when the video could not be signed for playback; the
  report now shows with a note that the clip cannot be played right now.
- The account's saved language is read with the session instead of a separate query.
- Next.js 16.4.0 and patch updates of the other dependencies.
- Load run, sizing guidance, launch checklist, live probes and this changelog.

### Included from earlier phases

- **Phase 1:** accounts and security, Stripe billing, swing and pitch video analysis, College
  Matchmaker, legal pages, staff review console, background worker.
- **Phase 2:** marketing site with FAQ, search, contact form, consent-backed reviews and analytics
  only after consent.
- **Phase 3:** settings, data export, account deletion with a cancellable window, email preferences
  and the guardian management link.
- **Phase 4:** public profiles with PDF and share links, verified metric badges, percentiles and the
  public calculator, the recruiting assistant, side-by-side comparison.
- **Phase 5:** hockey shot and football throw analysis, puck and ball tracking (beta), college coach
  tools with contact requests and guardian approval, end-to-end and accessibility suite, monitoring.
- **Phase 6:** licensed national norms, team accounts for high school and travel coaches, messaging
  after an accepted contact with guardian copies, installable app with offline logging and push.
- **Phase 7:** parent accounts, events and camps, the recruiting calendar, training plans, and
  Spanish across the product, emails and notifications.
