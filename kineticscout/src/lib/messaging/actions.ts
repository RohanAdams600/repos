'use server'

import { redirect } from 'next/navigation'
import { guardianCloseThread, guardianReport } from '@/lib/messaging/service'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

function back(thread: string, token: string, result: string): never {
  redirect(`/consent/guardian/messages?thread=${encodeURIComponent(thread)}&token=${encodeURIComponent(token)}&result=${result}`)
}

export async function guardianCloseThreadAction(formData: FormData): Promise<void> {
  const thread = String(formData.get('thread') ?? '')
  const token = String(formData.get('token') ?? '')
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) back(thread, token, 'limited')
  back(thread, token, (await guardianCloseThread(thread, token)) ? 'closed' : 'invalid')
}

export async function guardianReportAction(formData: FormData): Promise<void> {
  const thread = String(formData.get('thread') ?? '')
  const token = String(formData.get('token') ?? '')
  const messageId = String(formData.get('messageId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) back(thread, token, 'limited')
  if (reason.length < 10) back(thread, token, 'reason')
  back(thread, token, (await guardianReport(thread, token, messageId, reason)) ? 'reported' : 'invalid')
}
