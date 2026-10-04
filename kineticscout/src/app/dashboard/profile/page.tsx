import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AthleteProfileForm } from '@/components/auth/athlete-profile-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ProfileView } from '@/components/profile/profile-view'
import { SharingPanel } from '@/components/profile/sharing-panel'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { canPublishProfile } from '@/lib/auth/permissions'
import { requireAthlete } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { savedByVerifiedCoaches } from '@/lib/coach/prospects'
import { buildProfileCard, profileStats } from '@/lib/profile/public'
import { accountMessages } from '@/i18n/messages/account'
import { messages } from '@/i18n/server'
import { gradYearBounds } from '@/lib/validation/profile'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(accountMessages)).profile.title }
}

export default async function EditProfilePage({ searchParams }: PageProps<'/dashboard/profile'>) {
  const user = await requireAthlete('/dashboard/profile')
  if (user.role !== 'ATHLETE' || !user.hasAthleteProfile) redirect('/dashboard/settings')
  const params = await searchParams
  const t = await messages(accountMessages)
  const m = t.profile
  const key = [params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? m.notices[key] : undefined
  const profile = await db.athleteProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: {
      firstName: true,
      lastName: true,
      sport: true,
      primaryPosition: true,
      gradYear: true,
      heightInches: true,
      weightLbs: true,
      gpa: true,
      highSchool: true,
      twitterHandle: true,
      bats: true,
      throws: true,
      isPublic: true,
      publicSlug: true,
      publicShowGpa: true,
      publicShowSchool: true,
    },
  })
  const [preview, stats, savedBy] = await Promise.all([buildProfileCard(user.id, 'public'), profileStats(user.id), savedByVerifiedCoaches(user.id)])
  const canPublish = canPublishProfile(user)
  const url = profile.publicSlug ? `${env().APP_URL}/p/${profile.publicSlug}` : null
  const { min, max } = gradYearBounds()
  const gradYears = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  if (!gradYears.includes(profile.gradYear)) gradYears.unshift(profile.gradYear)

  const initial: Record<string, string> = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    sport: profile.sport,
    primaryPosition: profile.primaryPosition,
    gradYear: String(profile.gradYear),
    heightInches: profile.heightInches?.toString() ?? '',
    weightLbs: profile.weightLbs?.toString() ?? '',
    gpa: profile.gpa === null ? '' : Number(profile.gpa).toFixed(2),
    highSchool: profile.highSchool ?? '',
    twitterHandle: profile.twitterHandle ?? '',
    bats: profile.bats ?? '',
    throws: profile.throws ?? '',
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.dashboard, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro}</p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="sharing-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="sharing-title" className="text-xl font-bold">
          {m.shareTitle}
        </h2>
        {!canPublish && (
          <Alert tone="info">{m.needConsent}</Alert>
        )}
        <SharingPanel
          canPublish={canPublish}
          isPublic={profile.isPublic}
          showGpa={profile.publicShowGpa}
          showSchool={profile.publicShowSchool}
          url={url}
          stats={stats}
        />
        {profile.isPublic && (
          <p className="text-sm">{m.savedBy(savedBy)}</p>
        )}
        {canPublish && (
          <form method="post" action="/api/profile/pdf" className="border-t-2 border-border-subtle pt-6">
            <Button type="submit" variant="secondary">
              {m.pdf}
            </Button>
            <p className="mt-2 text-sm text-fg-muted">{m.pdfNote}</p>
          </form>
        )}
      </section>

      {preview && (
        <details className="border-2 border-border-subtle p-6">
          <summary className="cursor-pointer text-xl font-bold">{m.preview}</summary>
          <div className="mt-6">
            <ProfileView card={preview} />
          </div>
        </details>
      )}

      <section aria-labelledby="details-title" className="flex flex-col gap-4">
        <h2 id="details-title" className="text-2xl font-bold">
          {m.editTitle}
        </h2>
        <p className="text-fg-muted">{m.editIntro}</p>
        <AthleteProfileForm gradYears={gradYears} initial={initial} />
      </section>
    </div>
  )
}
