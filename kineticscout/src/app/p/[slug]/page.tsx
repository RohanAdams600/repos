import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { cache } from 'react'
import { ProfileView } from '@/components/profile/profile-view'
import { CopyButton } from '@/components/ui/copy-button'
import { buttonVariants } from '@/components/ui/button'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { buildProfileCard, findPublicAthlete, isLikelyBot, recordProfileEvent } from '@/lib/profile/public'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { pick } from '@/i18n/define'
import { domain } from '@/i18n/messages/domain'
import { profileMessages } from '@/i18n/messages/profile'
import { getLocale } from '@/i18n/server'

type Props = PageProps<'/p/[slug]'>

/** Metadata and the page body share one lookup per request instead of querying twice. */
const loadProfile = cache(async (slug: string) => {
  const athleteId = await findPublicAthlete(slug)
  const card = athleteId ? await buildProfileCard(athleteId, 'public') : null
  return athleteId && card ? { athleteId, card } : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocale()
  const m = pick(profileMessages, locale)
  const card = (await loadProfile((await params).slug))?.card
  if (!card) return { title: m.notFound, robots: { index: false, follow: false } }
  // Link previews show first name and last initial only; the full name is on the page itself.
  const title = m.metaTitle(card.firstName, card.lastName.charAt(0), card.gradYear, domain(locale).position[card.position])
  return {
    title,
    description: m.metaDescription(card.metrics.length, card.verifiedCount),
    // Shared by direct link; athlete profiles are never listed in search engines.
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title, type: 'profile' },
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params
  const loaded = await loadProfile(slug)
  if (!loaded) notFound()
  const { athleteId, card } = loaded

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
  const locale = await getLocale()
  const m = pick(profileMessages, locale)
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8">
      <ProfileView card={card} />
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-border-subtle pt-6">
        <a href={`/p/${slug}/pdf`} className={buttonVariants({ variant: 'primary' })}>
          {m.downloadPdf}
        </a>
        <CopyButton value={url} label={m.copyLink} />
      </div>
      {locale !== 'en' && <p className="text-sm text-fg-muted">{m.pdfNote}</p>}
      <p className="text-sm text-fg-muted">
        {m.createdBy} <Link href="/contact">{m.contactPage}</Link>.
      </p>
    </article>
  )
}
