import { env } from '@/lib/env'
import { pdfFilename } from '@/lib/profile/format'
import { renderProfilePdf } from '@/lib/profile/pdf'
import { buildProfileCard, findPublicAthlete, isLikelyBot, recordProfileEvent } from '@/lib/profile/public'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

/** Public PDF of a public profile, generated on request so it always shows current numbers. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params
  const athleteId = await findPublicAthlete(slug)
  if (!athleteId) return new Response('Not found', { status: 404 })
  if (!(await rateLimit('profilePdf', await hashedClientIp())).success) return new Response('Too many requests', { status: 429 })

  const card = await buildProfileCard(athleteId, 'public')
  if (!card) return new Response('Not found', { status: 404 })
  const pdf = await renderProfilePdf(card, { publicUrl: `${env().APP_URL}/p/${slug}`, generatedAt: new Date() })
  if (!isLikelyBot(request.headers.get('user-agent'))) await recordProfileEvent(athleteId, 'pdf').catch(() => undefined)

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdfFilename(card.firstName, card.lastName, card.gradYear)}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
