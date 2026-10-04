/**
 * Analytics consent stored in a first-party cookie. No analytics script is loaded, and no
 * attribution cookie is set, unless the value is "granted". Absence of the cookie means "not asked".
 */
export const CONSENT_COOKIE = 'ks_consent'
export const UTM_COOKIE = 'ks_utm'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365
export const UTM_MAX_AGE = 60 * 60 * 24 * 30

export type ConsentState = { analytics: boolean; version: number; decidedAt: number }

export function serializeConsent(analytics: boolean, now: number = Date.now()): string {
  return `v${CONSENT_VERSION}.${analytics ? 'granted' : 'denied'}.${Math.floor(now / 1000)}`
}

/** Returns null for missing, malformed or outdated values, so the visitor is asked again. */
export function parseConsent(value: string | undefined): ConsentState | null {
  const match = /^v(\d+)\.(granted|denied)\.(\d{9,11})$/.exec(value ?? '')
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null
  return { analytics: match[2] === 'granted', version: CONSENT_VERSION, decidedAt: Number(match[3]) * 1000 }
}

/** Marketing pages only. Analytics never runs on the dashboard, admin, auth or consent pages. */
const ANALYTICS_PATHS = [/^\/$/, /^\/pricing$/, /^\/faq$/, /^\/about$/, /^\/reviews$/, /^\/search$/, /^\/contact(\/thanks)?$/, /^\/blog(\/[a-z0-9-]+)?$/, /^\/case-studies(\/[a-z0-9-]+)?$/, /^\/legal\/[a-z]+$/]

export function analyticsAllowedOn(pathname: string): boolean {
  return ANALYTICS_PATHS.some((re) => re.test(pathname))
}
