import 'server-only'
import { env } from '@/lib/env'

/**
 * Bump when the Terms of Service or Privacy Policy change materially, and update TERMS_HIGHLIGHTS.
 * Signed-in users whose accepted version differs are sent to /terms-update before any dashboard
 * page or API call (requireUser and the tRPC protectedProcedure enforce it), and account holders are
 * emailed before the change takes effect, as the Privacy Policy promises.
 */
export const CURRENT_TERMS_VERSION = '2026-10-05.2'
export const LEGAL_LAST_UPDATED = 'October 5, 2026'

/** Plain-language summary shown on /terms-update for the current version. */
export const TERMS_HIGHLIGHTS: readonly string[] = [
  'New: parent and guardian accounts. A parent who signs up with the email address an athlete under 18 gave us can give or withdraw consent, approve team and coach contact requests, read copies of conversations with college coaches, see the athlete\'s events and training plans, download their data, or delete the account.',
  'New: showcases, camps and combines, checked by our staff against the organizer\'s page. Mark the events you are going to; verified college coaches see that only if you choose to show it and your profile is public.',
  'New: a recruiting calendar copied from the published calendars, with each source linked. It is a summary, not rules advice.',
  'New for Pro: four-week training plans built from your video analysis, with drills from our staff coaches. Plans show the measurements you log next to your starting value, without claiming the drills caused a change.',
  'You can download all of your data, or delete your account, yourself from Settings. Deletion happens after a 7-day window in which you can cancel.',
  'We never sell personal information, and published statistics always describe groups of at least 25 athletes.',
]

export type BusinessDetails = {
  legalName: string
  postalAddress: string
  supportEmail: string
  phone: string | null
  governingLaw: string
  /** True when every required detail is configured. Legal pages refuse to render otherwise in deployed environments. */
  complete: boolean
}

/**
 * Business identity comes from configuration, never from hard-coded sample values, so the legal
 * pages can only ever show the operator's real details.
 */
export function businessDetails(): BusinessDetails {
  const e = env()
  const legalName = e.BUSINESS_LEGAL_NAME
  const postalAddress = e.BUSINESS_POSTAL_ADDRESS
  const supportEmail = e.BUSINESS_SUPPORT_EMAIL
  const governingLaw = e.BUSINESS_GOVERNING_LAW
  return {
    legalName: legalName ?? 'the operator of KineticScout',
    postalAddress: postalAddress ?? 'Not configured',
    supportEmail: supportEmail ?? 'Not configured',
    phone: e.BUSINESS_PHONE ?? null,
    governingLaw: governingLaw ?? 'Not configured',
    complete: Boolean(legalName && postalAddress && supportEmail && governingLaw),
  }
}
