/**
 * Cookie hardening shared by the proxy and server-side Supabase clients.
 *
 * KineticScout never creates a browser Supabase client, so session cookies can be HttpOnly:
 * JavaScript running in the page (including any injected script) cannot read the tokens.
 */

export type CookieAttributes = {
  domain?: string
  path?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: boolean | 'lax' | 'strict' | 'none'
  partitioned?: boolean
  priority?: 'low' | 'medium' | 'high'
}

export function isSecureCookieEnvironment(appUrl: string | undefined): boolean {
  return Boolean(appUrl?.startsWith('https://'))
}

/** Applies HttpOnly, Secure (on https), SameSite=Lax and path=/ on top of library defaults. */
export function hardenCookieOptions<T extends CookieAttributes>(options: T | undefined, secure: boolean): T {
  return {
    ...(options ?? ({} as T)),
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  }
}

/** Short-lived cookie set after an under-13 age screen so the form cannot simply be resubmitted. */
export const AGE_SCREEN_COOKIE = 'ks_age_screen'
export const AGE_SCREEN_COOKIE_MAX_AGE = 60 * 60 * 24
