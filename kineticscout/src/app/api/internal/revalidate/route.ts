import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { env } from '@/lib/env'
import { constantTimeEqual } from '@/lib/security/hash'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  paths: z
    .array(z.string().regex(/^\/[a-z0-9/._-]*$/i).max(200))
    .min(1)
    .max(20),
})

/** Called by the worker after it publishes content. Authenticated with a shared secret, not cookies. */
export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${env().INTERNAL_API_SECRET}`
  if (!constantTimeEqual(auth, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })
  for (const path of parsed.data.paths) revalidatePath(path)
  return Response.json({ revalidated: parsed.data.paths.length })
}
