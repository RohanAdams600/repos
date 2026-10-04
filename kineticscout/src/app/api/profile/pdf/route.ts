import { canPublishProfile } from '@/lib/auth/permissions'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { pdfFilename } from '@/lib/profile/format'
import { renderProfilePdf } from '@/lib/profile/pdf'
import { buildProfileCard } from '@/lib/profile/public'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

/**
 * The athlete's own PDF, available whether or not the profile is public. It applies the same
 * visibility choices as the public page, and sharing it with coaches needs the same consent.
 */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const user = await getSessionUser()
  if (!user) return Response.redirect(new URL('/sign-in?next=/dashboard/profile', env().APP_URL), 303)
  if (!canPublishProfile(user)) return Response.redirect(new URL('/dashboard/profile?error=consent-required', env().APP_URL), 303)
  if (!(await rateLimit('profilePdf', user.id)).success) return Response.redirect(new URL('/dashboard/profile?error=pdf-limit', env().APP_URL), 303)

  const card = await buildProfileCard(user.id, 'public')
  if (!card) return Response.redirect(new URL('/onboarding', env().APP_URL), 303)
  const pdf = await renderProfilePdf(card, { publicUrl: card.isPublic && card.slug ? `${env().APP_URL}/p/${card.slug}` : null, generatedAt: new Date() })
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdfFilename(card.firstName, card.lastName, card.gradYear)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
