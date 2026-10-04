'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CONSENT_COOKIE, CONSENT_MAX_AGE, serializeConsent, UTM_COOKIE, UTM_MAX_AGE } from '@/lib/consent'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { fieldErrorsFrom, formValues, type FormState } from '@/lib/forms'
import { businessDetails } from '@/lib/legal'
import { errorFields, logger } from '@/lib/logger'
import { parseUtm } from '@/lib/marketing/utm'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { escapeHtml } from '@/lib/security/sanitize'
import { CONTACT_TOPICS, contactSchema } from '@/lib/validation/contact'

const cookieBase = () => ({ httpOnly: true, sameSite: 'lax' as const, path: '/', secure: env().APP_URL.startsWith('https://') })

/**
 * Records the visitor's analytics choice. On "granted", first-touch UTM values from the landing URL
 * are kept in a 30-day first-party cookie so a later sign-up can be attributed. On "denied",
 * any attribution cookie is removed.
 */
export async function recordConsentAction(analytics: boolean, landingSearch: string): Promise<void> {
  const store = await cookies()
  store.set(CONSENT_COOKIE, serializeConsent(analytics), { ...cookieBase(), maxAge: CONSENT_MAX_AGE })
  if (!analytics) {
    store.delete(UTM_COOKIE)
    return
  }
  const utm = parseUtm(new URLSearchParams(landingSearch.slice(0, 1000)))
  if (Object.keys(utm).length > 0 && !store.get(UTM_COOKIE)) {
    store.set(UTM_COOKIE, JSON.stringify(utm), { ...cookieBase(), maxAge: UTM_MAX_AGE })
  }
}

/** "Cookie settings" in the footer: forget the choice so the banner asks again. */
export async function resetConsentAction(): Promise<void> {
  const store = await cookies()
  store.delete(CONSENT_COOKIE)
  store.delete(UTM_COOKIE)
}

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData)
  // Honeypot: real visitors never see or fill this field. Bots get the normal success path.
  if (typeof formData.get('website') === 'string' && formData.get('website') !== '') redirect('/contact/thanks')

  if (!(await rateLimit('contact', await hashedClientIp())).success) {
    return { status: 'error', message: 'You have sent several messages recently. Please wait an hour, or email us directly.', values }
  }
  const parsed = contactSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const input = parsed.data
  const saved = await db.contactMessage.create({ data: input, select: { id: true } })

  const business = businessDetails()
  if (business.supportEmail.includes('@')) {
    const topic = CONTACT_TOPICS.find((t) => t.value === input.topic)?.label ?? input.topic
    const userAgent = (await headers()).get('user-agent')?.slice(0, 200) ?? 'unknown'
    try {
      await sendEmail({
        to: business.supportEmail,
        replyTo: input.email,
        subject: `[Contact] ${topic}: ${input.name}`,
        text: `From: ${input.name} <${input.email}>\nTopic: ${topic}\nReference: ${saved.id}\nBrowser: ${userAgent}\n\n${input.message}`,
        html: `<p><strong>From:</strong> ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;<br><strong>Topic:</strong> ${escapeHtml(topic)}<br><strong>Reference:</strong> ${saved.id}</p><p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`,
        idempotencyKey: `contact-${saved.id}`,
      })
    } catch (error) {
      // The message is stored; staff can still see it in /admin.
      logger.error(errorFields(error), 'contact notification email failed')
    }
  }
  redirect(`/contact/thanks?topic=${input.topic}`)
}
