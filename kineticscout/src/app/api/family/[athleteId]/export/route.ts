import { buildAccountExport } from '@/lib/account/export'
import { audit } from '@/lib/audit'
import { guardedAthlete, getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { isEngaged } from '@/lib/family/service'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

/**
 * A parent or guardian's download of everything held about their athlete's account. Only for a
 * guardian account the athlete's consent names, after the guardian has answered the consent
 * request; anyone else gets 404.
 */
export async function POST(request: Request, { params }: RouteContext<'/api/family/[athleteId]/export'>): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const user = await getSessionUser()
  if (!user) return Response.redirect(new URL('/sign-in?next=/dashboard/family', env().APP_URL), 303)
  const athlete = await guardedAthlete(user, (await params).athleteId)
  if (!athlete || !isEngaged(athlete.consentStatus)) return new Response('Not found', { status: 404 })
  if (!(await rateLimit('dataExport', user.id)).success) return new Response('Too many downloads. Try again in an hour.', { status: 429 })

  const now = new Date()
  const data = await buildAccountExport(athlete.athleteId, now)
  await audit('guardian.data_exported', { actorId: user.id, targetType: 'user', targetId: athlete.athleteId })
  return new Response(JSON.stringify({ requestedBy: 'parent or guardian', ...data }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kineticscout-${athlete.firstName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${now.toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
