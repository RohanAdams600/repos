'use server'

import { redirect } from 'next/navigation'
import { guardianDecideContact } from '@/lib/coach/contact'
import { confirmWorkEmail } from '@/lib/coach/verification'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

/** Confirmed by a button press, not by opening the link, so email scanners cannot use up the token. */
export async function confirmWorkEmailAction(formData: FormData): Promise<void> {
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) redirect('/coach/verify-email?result=limited')
  const result = await confirmWorkEmail(String(formData.get('token') ?? ''))
  redirect(`/coach/verify-email?result=${result}`)
}

export async function guardianContactAction(formData: FormData): Promise<void> {
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) redirect('/consent/guardian/contact?result=limited')
  const token = String(formData.get('token') ?? '')
  const approve = formData.get('decision') === 'approve'
  const result = await guardianDecideContact(token, approve)
  redirect(`/consent/guardian/contact?result=${result}`)
}
