import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { ProfileView } from '@/components/profile/profile-view'
import { CopyButton } from '@/components/ui/copy-button'
import { buttonVariants } from '@/components/ui/button'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { buildProfileCard, findPublicAthlete, isLikelyBot, recordProfileEvent } from '@/lib/profile/public'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

type Props = PageProps<'/p/[slug]'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const athleteId = await findPublicAthlete((await params).slug)
  const card = athleteId ? await buildProfileCard(athleteId, 'public') : null
  if (!card) return { title: 'Profile not found', robots: { index: false, follow: false } }
  // Link previews show first name and last initial only; the full name is on the page itself.
  const title = `${card.firstName} ${card.lastName.charAt(0)}., Class of ${card.gradYear} ${card.positionLabel}`
  return {
    title,
    description: `Recruiting profile with ${card.metrics.length} measurements${card.verifiedCount ? `, ${card.verifiedCount} verified from video` : ''}.`,
    // Shared by direct link; athlete profiles are never listed in search engines.
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title, type: 'profile' },
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params
  const athleteId = await findPublicAthlete(slug)
  if (!athleteId) notFound()
  const card = await buildProfileCard(athleteId, 'public')
  if (!card) notFound()

  const viewer = await getSessionUser()
  const userAgent = (await headers()).get('user-agent')
  if (viewer?.id !== athleteId && !isLikelyBot(userAgent)) {
    const ipKey = await hashedClientIp()
    after(async () => {
      // One counted view per visitor per profile per hour keeps refreshes from inflating counts.
      if (!(await rateLimit('profileViewDedupe', `${ipKey}:${athleteId}`)).success) return
      await recordProfileEvent(athleteId, 'view').catch((error: unknown) => logger.warn({ err: { message: (error as Error).message } }, 'profile view not recorded'))
    })
  }

  const url = `${env().APP_URL}/p/${slug}`
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8">
      <ProfileView card={card} />
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border-subtle pt-6">
        <a href={`/p/${slug}/pdf`} className={buttonVariants({ variant: 'primary' })}>
          Download PDF
        </a>
        <CopyButton value={url} label="Copy link" />
      </div>
      <p className="text-sm text-fg-muted">
        Profiles on KineticScout are created by athletes. Questions about this athlete? Contact them directly. To report a profile, use our{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </article>
  )
}
