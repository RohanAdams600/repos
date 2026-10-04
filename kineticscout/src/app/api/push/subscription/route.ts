import { z } from 'zod'
import { getSessionUser } from '@/lib/auth/session'
import { PushSubscriptionError, removePushSubscription, savePushSubscription, vapidConfig } from '@/lib/push/service'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

const subscriptionSchema = z.object({
  endpoint: z.string().max(1024),
  keys: z.object({ p256dh: z.string().max(128), auth: z.string().max(64) }),
})

/**
 * Turns push on or off for this browser. A route handler (not tRPC) so the sign-out button can
 * remove the device's subscription from any page.
 */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401 })
  if (!vapidConfig()) return Response.json({ error: 'Notifications are not available.' }, { status: 404 })
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid subscription.' }, { status: 400 })
  try {
    await savePushSubscription(user.id, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth })
  } catch (error) {
    if (error instanceof PushSubscriptionError) return Response.json({ error: error.message }, { status: 400 })
    throw error
  }
  return Response.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const user = await getSessionUser()
  if (!user) return Response.json({ ok: true })
  const parsed = z.object({ endpoint: z.string().max(1024) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 })
  await removePushSubscription(user.id, parsed.data.endpoint)
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
