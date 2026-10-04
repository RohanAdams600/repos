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
import { gradYearBounds } from '@/lib/validation/profile'

export const metadata: Metadata = { title: 'Profile and sharing' }

const MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  'link-rotated': { tone: 'success', text: 'New link created. The old link no longer works.' },
  'consent-required': { tone: 'error', text: 'A parent or guardian must give consent before you can share your profile with coaches.' },
  'pdf-limit': { tone: 'error', text: 'You have downloaded the PDF many times in the last hour. Try again later.' },
  'rate-limited': { tone: 'error', text: 'Too many changes. Try again in a minute.' },
}

export default async function EditProfilePage({ searchParams }: PageProps<'/dashboard/profile'>) {
  const user = await requireAthlete('/dashboard/profile')
  if (user.role !== 'ATHLETE' || !user.hasAthleteProfile) redirect('/dashboard/settings')
  const params = await searchParams
  const key = [params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? MESSAGES[key] : undefined
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
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile and sharing' }]} />
        <h1 className="text-3xl font-bold">Profile and sharing</h1>
        <p className="text-fg-muted">
          Share one link or a one-page PDF with college coaches instead of building a website. Both always show your latest numbers.
        </p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="sharing-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="sharing-title" className="text-xl font-bold">
          Share with recruiters
        </h2>
        {!canPublish && (
          <Alert tone="info">
            A parent or guardian must give consent before your profile can be public or shared. You can still edit it and preview it below.
          </Alert>
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
          <p className="text-sm">
            <span className="tabular font-bold">{savedBy}</span> verified college {savedBy === 1 ? 'coach has' : 'coaches have'} saved your profile. We never
            show which coaches; they can contact you only through a request you accept.
          </p>
        )}
        {canPublish && (
          <form method="post" action="/api/profile/pdf" className="border-t-2 border-border-subtle pt-6">
            <Button type="submit" variant="secondary">
              Download PDF
            </Button>
            <p className="mt-2 text-sm text-fg-muted">A one-page summary to attach to emails. It includes your profile link when the profile is public.</p>
          </form>
        )}
      </section>

      {preview && (
        <details className="border-2 border-border-subtle p-6">
          <summary className="cursor-pointer text-xl font-bold">Preview what recruiters see</summary>
          <div className="mt-6">
            <ProfileView card={preview} />
          </div>
        </details>
      )}

      <section aria-labelledby="details-title" className="flex flex-col gap-4">
        <h2 id="details-title" className="text-2xl font-bold">
          Edit details
        </h2>
        <p className="text-fg-muted">Keep these details accurate; they drive your percentiles and college matches. Optional fields can be left blank.</p>
        <AthleteProfileForm gradYears={gradYears} initial={initial} />
      </section>
    </div>
  )
}
