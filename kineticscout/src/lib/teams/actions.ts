'use server'

import { redirect } from 'next/navigation'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { guardianDecideTeam } from '@/lib/teams/service'

/** Decided by a button press, never by opening the link, so email scanners cannot approve anything. */
export async function guardianTeamAction(formData: FormData): Promise<void> {
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) redirect('/consent/guardian/team?result=limited')
  const token = String(formData.get('token') ?? '')
  const approve = formData.get('decision') === 'approve'
  const result = await guardianDecideTeam(token, approve)
  redirect(`/consent/guardian/team?result=${result}`)
}
