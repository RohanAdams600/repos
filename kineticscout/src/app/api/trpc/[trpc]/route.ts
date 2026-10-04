import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/routers/_app'
import { createTrpcContext } from '@/server/trpc'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024

async function handler(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createTrpcContext({ headers: request.headers }),
    responseMeta: () => ({ headers: new Headers({ 'Cache-Control': 'private, no-store' }) }),
  })
}

export { handler as GET, handler as POST }
