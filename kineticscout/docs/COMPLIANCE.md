# Compliance notes

This document records how the product meets the "do not get sued" checklist, and what still needs a human decision. It is engineering documentation, not legal advice: have counsel review the legal pages and these notes before launch.

## Children and teens

- **COPPA (under 13).** Sign-up uses a neutral date-of-birth screen. If the date is under 13, the server stores nothing, sends nothing to Supabase, and sets a 24-hour cookie so the form cannot simply be resubmitted with a different date. The message does not reveal the cutoff. If an under-13 date reaches onboarding (an interrupted sign-up), the Supabase auth user is deleted.
- **Teens (13 to 17).** A parent or guardian email is required. Until the guardian consents through an emailed one-time link (confirmed by POST, with an attestation checkbox), the profile stays private and purchases and coach outreach are blocked (`src/lib/auth/permissions.ts`). Guardian tokens are stored hashed, are single-use, and expire after 7 days.
- **Advertising.** Paid ads target adults only: the Meta client refuses any ad set whose `age_min` is under 18, and ad copy is checked for promises aimed at children.

## Data minimisation and inventory

| Data | Why it is needed | Retention |
|---|---|---|
| Email, password hash (Supabase) | Account access | Until deletion |
| Date of birth | Age rules (COPPA, minor protections) | Until deletion |
| Guardian email | Consent for minors | Until deletion |
| Name, class, sport, position | Profile, percentiles, matching | Until deletion |
| Height, weight, GPA, high school, X handle, bats/throws | Optional; matching and profile | Until deletion |
| Metrics | Core feature | Until deletion |
| Videos | Analysis and playback | 12 months (`VIDEO_RETENTION_DAYS`), then purged by the worker |
| Pose track and report | Analysis results | Until deletion |
| Stripe customer id, subscription status | Billing | Until deletion; Stripe keeps invoices as required by law |
| Hashed IPs, audit events | Security | 24 months, purged by the worker |
| Contact form messages | Answering the visitor | 12 months, purged by the worker |
| First-touch UTM values (with consent) | Campaign attribution | Until deletion (cookie: 30 days) |

Not collected: location, contacts, device identifiers, advertising identifiers, third-party analytics.

## User rights

- Deletion cascades from `users` through every owned table (tested). Phase 1 handles requests by email (the Privacy Policy promises confirmation within 2 business days and completion within 30 days). Phase 3 adds a self-serve "Delete my data" flow and data export.
- Marketing email is opt-in only (unchecked by default). `sendEmail` attaches `List-Unsubscribe` and one-click headers whenever an unsubscribe URL is given. The unsubscribe endpoint ships in Phase 3, **before any marketing email is sent**.

## Consent and cookies

Strictly necessary cookies (auth session, theme, age-screen block, the consent choice itself) are always set. Google Analytics is optional and only active when `GA_MEASUREMENT_ID` is configured:

- The banner offers Reject and Accept with equal size and weight. Nothing is preselected and the site works fully either way.
- Before a choice, no request goes to Google (verified in a browser test). After Reject, none ever does.
- After Accept, GA4 loads only on public marketing pages, never on the dashboard, admin, sign-up or consent pages, which teens use. Google signals and ad personalisation are off, and no user ids are sent.
- First-touch UTM attribution (`ks_utm`, 30 days) is stored only after Accept and is copied to the account at sign-up.
- "Cookie settings" in the footer clears the choice so the banner asks again. The CSP opens Google's endpoints only for consenting visitors on allowed pages.

## Third-party SDK audit

| Package | Purpose | Data shared | Runs in browser? |
|---|---|---|---|
| @supabase/ssr, @supabase/supabase-js | Auth | Email, password (sign-in), session | No |
| @prisma/client, pg | Database | All app data (our database) | No |
| stripe | Payments | Email, Stripe customer id | No (Checkout is a Stripe-hosted page) |
| openai | Copy and articles | Aggregate statistics and product facts only | No |
| @google-cloud/storage, @google-cloud/video-intelligence | Video storage and pose | Uploaded videos | No (browser uploads to a signed URL) |
| @upstash/ratelimit, @upstash/redis, bullmq, ioredis | Rate limiting, cache, queues | Hashed keys, user ids, job ids | No |
| recharts, @radix-ui/*, @tanstack/react-query, @trpc/* | UI and data fetching | None to third parties | Yes, no network calls of their own |
| Google Analytics 4 (gtag.js, loaded by URL, not an npm package) | Public page analytics | Page views, device and approximate location as collected by GA; no user ids | Yes, only after Accept, public pages only |

No third-party script, pixel or font is loaded in the browser except Google Analytics after explicit consent. CSP enforces this: `script-src 'self' 'nonce-…'`, and `connect-src` allows only our own origin plus GCS for signed uploads (plus Google Analytics endpoints for consenting visitors on public pages).

## Fonts, images, copyright

- Roboto Mono: Apache License 2.0, self-hosted at build. Helvetica Neue / system-ui come from the visitor's own system.
- No stock photography or third-party images. The logo, favicon and social share image are original vector or code-generated artwork.
- Phase 4 side-by-side comparisons need **licensed** reference footage of professional players; MLB footage cannot be used without a licence.

## Honest marketing (no dark patterns, no hidden fees)

- Prices shown are checked against the live Stripe price before every checkout. Tax is shown before payment only if Stripe Tax is enabled. There are no cancellation fees, and cancellation is one step in the Stripe portal.
- No fake reviews, testimonials or statistics. Reviews can only be attached to an existing account, require an attested consent, are deleted with the account, and pages show an empty state until real ones exist. Case studies cannot be published without a recorded consent date (enforced by a database constraint). The team section stays hidden until real people are added to `content/team.json`. The Growth agent's compliance checker blocks guarantees, recruiting promises, unsupported numbers and superlatives, fake urgency, and third-party trademarks in ads. The SEO agent's fact checker holds back any article that contains a number not found in its data snapshot. Articles carry an AI-assistance disclosure and a methodology section.
- Fit bands describe how measurables compare and are never presented as a prediction of an offer.

## Decisions needed from the business

1. Real legal entity, postal address, support email, phone and governing law (`BUSINESS_*` variables). Deployed environments refuse to boot without them.
2. Counsel review of `/legal/*` pages and the refund terms (14-day window as drafted).
3. Real college program data from a licensed or public source, with `data_source_url` and `data_verified_at`; development fixtures are fictional and blocked outside local.
4. Real reviews, case studies (with written consent) and team photos the business owns or licenses.
5. Whether to enable `SEO_AUTOPUBLISH`, `GROWTH_AUTO_APPROVE`, `META_AUTOPUBLISH` and `META_ADS_AUTO_ACTIVATE`. All default to off: drafts wait for review in `/admin`.
