import { buildAccountExport } from '@/lib/account/export'
import { audit } from '@/lib/audit'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

/** Download of everything held about the signed-in account, as JSON (right of access and portability). */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const user = await getSessionUser()
  if (!user) return Response.redirect(new URL('/sign-in?next=/dashboard/settings', env().APP_URL), 303)
  const limit = await rateLimit('dataExport', user.id)
  if (!limit.success) return Response.redirect(new URL('/dashboard/settings?error=export-limit', env().APP_URL), 303)

  const now = new Date()
  const data = await buildAccountExport(user.id, now)
  await audit('account.data_exported', { actorId: user.id, targetType: 'user', targetId: user.id })
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kineticscout-data-${now.toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
