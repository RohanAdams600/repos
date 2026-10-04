# Compliance notes

This document records how the product meets the "do not get sued" checklist, and what still needs a human decision. It is engineering documentation, not legal advice: have counsel review the legal pages and these notes before launch.

## Children and teens

- **COPPA (under 13).** Sign-up uses a neutral date-of-birth screen. If the date is under 13, the server stores nothing, sends nothing to Supabase, and sets a 24-hour cookie so the form cannot simply be resubmitted with a different date. The message does not reveal the cutoff. If an under-13 date reaches onboarding (an interrupted sign-up), the Supabase auth user is deleted.
- **Teens (13 to 17).** A parent or guardian email is required. Until the guardian consents through an emailed one-time link (confirmed by POST, with an attestation checkbox), the profile stays private and purchases and coach outreach are blocked (`src/lib/auth/permissions.ts`). Guardian tokens are stored hashed, are single-use, and expire after 7 days.
- **Ongoing guardian control.** The consent confirmation email carries a private management link (`/consent/guardian/manage`, valid 1 year, re-requestable from `/legal/your-data` without revealing whether an address is on file). It lets the guardian withdraw consent (immediate: profile private, purchases and outreach blocked, open coach contact requests declined and shared addresses cleared from coaches' pages, teen notified), optionally stop renewal, give consent again with a fresh attestation, and request or cancel deletion of the account.
- **Advertising.** Paid ads target adults only: the Meta client refuses any ad set whose `age_min` is under 18, and ad copy is checked for promises aimed at children.

## Data minimisation and inventory

| Data | Why it is needed | Retention |
|---|---|---|
| Email, password hash (Supabase) | Account access | Until deletion |
| Date of birth | Age rules (COPPA, minor protections) | Until deletion |
| Guardian email | Consent for minors | Until deletion |
| Public profile choices, daily view and PDF counts | Sharing with recruiters | Until deletion (no visitor identifiers stored) |
| Verification clip, check results, file hash, decision | Verified badges | Clip: 30 days after decision (immediately if auto-rejected). Decision and hash: until deletion |
| Outreach drafts, recruiting alert settings, notifications | Recruiting assistant | Until the athlete deletes them or the account |
| Marketing choice and its timestamp | Proof of opt-in or opt-out | Until deletion |
| Deletion receipt (keyed hash, dates, steps) | Proof a deletion request was honored | Kept; contains no personal data |
| Name, class, sport, position | Profile, percentiles, matching | Until deletion |
| Height, weight, GPA, high school, X handle, bats/throws | Optional; matching and profile | Until deletion |
| Metrics | Core feature | Until deletion |
| Videos | Analysis and playback | 12 months (`VIDEO_RETENTION_DAYS`), then purged by the worker |
| Pose track and report | Analysis results | Until deletion |
| Stripe customer id, subscription status | Billing | Until deletion; Stripe keeps invoices as required by law |
| Hashed IPs, audit events | Security | 24 months, purged by the worker |
| Contact form messages | Answering the visitor | 12 months, purged by the worker |
| First-touch UTM values (with consent) | Campaign attribution | Until deletion (cookie: 30 days) |
| Coach name, title, program, school email, staff directory link, review decision | Proving a coach works where they say | Until the coach deletes the account |
| Saved athletes and private notes (coach) | Coach's recruiting board | Until removed or the coach account is deleted |
| Contact requests: message, responses, shared email addresses | Letting athletes decide whether a coach gets their email | Until either account is deleted; open requests expire after 30 days; shared addresses cleared on block or consent withdrawal |
| Blocks and reports about coaches | Safety | Until either account is deleted |
| Puck or ball track and estimate (opt-in beta) | Analysis result | Until deletion, with the analysis |
| Team coach name, title, team, school or club, state, staff page link, review decision | Proving a team coach is who they say | Until the coach deletes the account |
| Team membership, testing days, recorded results and the athlete's answers | Coach-recorded measurements | Until either account is deleted; accepted results become the athlete's measurements |
| Messages, read times, message reports | Recruiting conversations after an accepted contact | Until either account is deleted; ended conversations deleted 12 months after ending unless a report is open |
| Push subscription (endpoint and keys) | Notifications on a device the user chose | Until turned off, signed out on that device, or reported gone by the push service |
| Offline measurement outbox (on the device, not our servers) | Logging without a connection | Until sent, at most 30 days; cleared at sign-out |

Not collected: location, contacts, device identifiers, advertising identifiers, third-party analytics.

## User rights

- **Access and portability.** Settings → Download my data returns a JSON file covering every table that holds the user's data (account, guardian consent, profile, metrics, pipeline, analyses with reports, subscriptions, reviews, contact messages, AI feature use, security events). Audited as `account.data_exported`.
- **Rectification.** Athletes edit every profile field at `/dashboard/profile`; email and date of birth changes go through support (they drive authentication and age rules).
- **Deletion.** Self-serve from Settings with password re-entry, or by a guardian, or entered by staff for an emailed request. 7-day cancellable window (profile private, marketing off, renewal switched off), then the worker deletes the Stripe customer, stored videos, the login and every database row (cascade, tested). A `DataDeletionReceipt` with a keyed hash records when it was requested and completed.
- **Marketing email.** Opt-in only (unchecked by default), with the time of each choice recorded (`marketing_opt_in_updated_at`). `sendMarketingEmail` is the only sending path; it re-checks consent at send time, skips minors without guardian consent and accounts pending deletion, and adds RFC 8058 one-click unsubscribe headers, a visible preferences link and the postal address (CAN-SPAM). The preference centre works without signing in.
- **Changes to terms.** Bumping `CURRENT_TERMS_VERSION` gates the dashboard and API behind `/terms-update`, where users can accept, or download their data and delete the account instead. Acceptance is audited with the version. The business must still email account holders before a material change takes effect, as the policy promises.

## Phase 4 privacy notes

- **Public profiles** are opt-in, need guardian consent for minors (re-checked on every view), are `noindex`, never put a last name in the URL, and can be made private or given a new link at any time. GPA and high school are hidden unless chosen.
- **Verification clips** are viewed only by staff reviewers through short-lived signed URLs, never shown publicly, and deleted 30 days after the decision.
- **Outreach** is drafted, never sent: the athlete copies or opens the draft in their own email. Drafts can only use facts on the athlete's own profile and sourced program facts, and minors need guardian consent before the feature is available.
- **Aggregates**: build-cohort percentiles and cross-sport equivalents use groups of at least 25 athletes; the anonymous calculator rounds to the nearest 5 and stores nothing it is given.

## Phase 5 privacy notes

- **Coach access is narrow by design.** Coaches must be adults whose school email and staff directory listing staff have checked. They see only athletes with public profiles, and only the public card; a profile that goes private disappears from their search and boards. Athletes see how many verified coaches saved them, never who.
- **Athletes decide, guardians co-decide.** No contact detail reaches a coach until the athlete accepts; for a minor a guardian must approve too, and then the coach receives both addresses and is asked to include the guardian. First messages cannot contain links or phone numbers, every request carries the coach's attestation that their association's rules allow contact, and athletes can block or report at any time. A guardian withdrawing consent ends every coach's access on the platform.
- **Recruiting rules are the coach's responsibility.** KineticScout does not track contact periods for each association; the Terms make the coach responsible and require an attestation on each request. KineticScout is not affiliated with any governing body.
- **Tracking beta** is opt-in per upload, costs more (included in the budget reservation), and its speed is labelled a lower bound in the product and the Terms.
- **Exports** include contact requests received, blocks and reports (athletes) and the coach profile, saved athletes with notes, and requests sent (coaches).

## Phase 6 privacy notes

- **National norms** are aggregate tables the business licenses. The comparison runs on our servers; nothing about an athlete is sent to a publisher. Every figure names the table, publisher, edition, population and band sample size, and a table stops being used the day after its licence ends.
- **Teams** give an adult coach the athlete's name, class and position, plus the results that coach records, and nothing else. Minors join only with a guardian's approval, every result needs the athlete's acceptance, and guardian withdrawal ends memberships.
- **Messages** with minors are copied in full to the guardian, who can end the conversation or report a message without an account. Staff read messages only through the report queue, and each review is audited.
- **Notifications** are opt-in per device after a click (never a prompt on page load) and show a generic line only, because lock screens are often visible to others.
- **Offline storage** is limited to measurements waiting to send and an offline page with no account data; both are listed in the Cookie Policy.
- **Exports** now include teams, team results, conversations and notification devices (the push service name only, since the endpoint works like a credential).

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
| openai | Copy, articles and outreach drafts | Aggregate statistics and product facts; for outreach drafts (Pro, consent required for minors), the athlete's name, class, position, best measurements and optional height, weight, GPA and high school, plus sourced program facts. Never email, date of birth or video | No |
| pdf-lib, @pdf-lib/fontkit | Profile PDF | None (runs on our server) | No |
| @google-cloud/storage, @google-cloud/video-intelligence | Video storage and pose | Uploaded videos | No (browser uploads to a signed URL) |
| @upstash/ratelimit, @upstash/redis, bullmq, ioredis | Rate limiting, cache, queues | Hashed keys, user ids, job ids | No |
| recharts, @radix-ui/*, @tanstack/react-query, @trpc/* | UI and data fetching | None to third parties | Yes, no network calls of their own |
| Google Analytics 4 (gtag.js, loaded by URL, not an npm package) | Public page analytics | Page views, device and approximate location as collected by GA; no user ids | Yes, only after Accept, public pages only |

No third-party script, pixel or font is loaded in the browser except Google Analytics after explicit consent. CSP enforces this: `script-src 'self' 'nonce-…'`, and `connect-src` allows only our own origin plus GCS for signed uploads (plus Google Analytics endpoints for consenting visitors on public pages).

## Fonts, images, copyright

- Roboto Mono: SIL Open Font License 1.1 (current upstream releases), self-hosted at build and embedded as a subset in profile PDFs; the licence text ships in `assets/fonts/LICENSE-RobotoMono.txt`. Helvetica Neue / system-ui come from the visitor's own system; PDFs use the standard Helvetica font.
- No stock photography or third-party images. The logo, favicon and social share image are original vector or code-generated artwork.
- Side-by-side comparisons use **licensed** reference footage only. A clip cannot be created without licensor, licence reference and attribution (database CHECK), the uploader confirms the licence covers this use, playback stops automatically at the licence end date, and the player hides download and picture-in-picture controls. Until licensed footage exists, athletes compare their own clips.

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
6. Licensed reference footage for side-by-side comparisons, and a licensed source of coaching-staff and roster-need data (or staff time to enter changes from school announcements).
7. Staff time to review verification clips (the dashboard promises a decision within about 2 business days).
8. Before deploying Phase 4: email account holders about the updated Privacy Policy (outreach drafts now send profile facts to OpenAI). `CURRENT_TERMS_VERSION` is bumped, so signed-in users are asked to accept the new version.
9. Staff time for coach account reviews (promised "usually within 2 business days") and for reports about coaches (alert after 24 hours, page after 3 days). Decide who may suspend a coach out of hours.
10. Before deploying Phase 5: email account holders about the updated Privacy Policy and Terms (coach contact requests, guardian approval, tracking beta). `CURRENT_TERMS_VERSION` is bumped to `2026-10-04.3`.
11. Counsel review of the coach terms against the recruiting rules of the associations the product will serve (for example NCAA, NAIA and NJCAA contact periods), and whether any association requires more than the coach's attestation.
12. A licence for national norms data (or a decision to show KineticScout comparisons only). Import only tables whose licence allows showing the figures to users; keep the licence on file.
13. Staff time for team reviews (promised "usually within 2 business days") and for message reports (alert after 24 hours, page after 3 days). Message reports involve minors: decide who may read them and how quickly.
14. Before deploying Phase 6: email account holders about the updated Privacy Policy, Terms and Cookie Policy (messaging with guardian copies, teams, national norms, notifications, offline storage). `CURRENT_TERMS_VERSION` is bumped to `2026-10-05.1`.
15. VAPID keys for Web Push per environment, if notifications should be offered.
