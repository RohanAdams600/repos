'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthIdentity } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/auth/supabase'
import { errorFields, logger } from '@/lib/logger'
import { isLocale, LOCALE_COOKIE, SPANISH_ENABLED } from '@/i18n/config'

/** Only paths on this site, so the switch cannot be used as an open redirect. */
function safeReturn(value: unknown, referer: string | null): string {
  const candidates = [typeof value === 'string' ? value : '', referer ? (() => { try { const u = new URL(referer); return u.origin === new URL(env().APP_URL).origin ? u.pathname + u.search : '' } catch { return '' } })() : '']
  for (const c of candidates) if (c.startsWith('/') && !c.startsWith('//') && !c.includes('\\') && c.length <= 2048) return c
  return '/'
}

/** Remembers the chosen language on this device and, when signed in, on the account (emails follow it). */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale')
  const target = safeReturn(formData.get('returnTo'), (await headers()).get('referer'))
  if (!SPANISH_ENABLED || !isLocale(locale)) redirect(target)
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31_536_000, sameSite: 'lax', httpOnly: true, secure: env().APP_URL.startsWith('https://') })
  const identity = await getAuthIdentity().catch(() => null)
  if (identity) {
    await db.user.updateMany({ where: { id: identity.id }, data: { locale } })
    // Supabase's own emails (password reset) read the language from the user's metadata.
    try {
      await (await createSupabaseServerClient()).auth.updateUser({ data: { locale } })
    } catch (error) {
      logger.warn(errorFields(error), 'could not save language for auth emails')
    }
  }
  redirect(target)
}
