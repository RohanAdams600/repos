import 'server-only'
import { env } from '@/lib/env'

/**
 * Bump when the Terms of Service or Privacy Policy change materially, and update TERMS_HIGHLIGHTS.
 * Signed-in users whose accepted version differs are sent to /terms-update before any dashboard
 * page or API call (requireUser and the tRPC protectedProcedure enforce it), and account holders are
 * emailed before the change takes effect, as the Privacy Policy promises.
 */
export const CURRENT_TERMS_VERSION = '2026-10-05.1'
export const LEGAL_LAST_UPDATED = 'October 5, 2026'

/** Plain-language summary shown on /terms-update for the current version. */
export const TERMS_HIGHLIGHTS: readonly string[] = [
  'New: message college coaches inside KineticScout once you accept their request. If you are under 18, your parent or guardian gets a copy of every message and can end the conversation. Our staff read messages only when someone reports them.',
  'New: join your high school or travel team with a code from your coach. The coach sees your name, class and position, and results they record appear on your profile, marked coach-recorded, only if you accept them. Under 18, a parent or guardian approves first.',
  'New: when a licensed national table covers your age and build, you also see where you stand nationally, with the table and publisher named. Nothing about you is sent to the publisher.',
  'New: install KineticScout on your phone, log measurements offline, and turn on notifications per device. Notifications never show names or message text.',
  'If a parent or guardian withdraws consent, coach contact requests are declined, conversations and team memberships end, and shared email addresses are removed from coaches\' pages.',
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
