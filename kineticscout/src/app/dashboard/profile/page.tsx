import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AthleteProfileForm } from '@/components/auth/athlete-profile-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireAthlete } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { gradYearBounds } from '@/lib/validation/profile'

export const metadata: Metadata = { title: 'Edit profile' }

export default async function EditProfilePage() {
  const user = await requireAthlete('/dashboard/profile')
  if (user.role !== 'ATHLETE' || !user.hasAthleteProfile) redirect('/dashboard/settings')
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
    },
  })
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
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Edit profile' }]} />
        <h1 className="text-3xl font-bold">Edit profile</h1>
        <p className="text-fg-muted">Keep these details accurate; they drive your percentiles and college matches. Optional fields can be left blank.</p>
      </div>
      <AthleteProfileForm gradYears={gradYears} initial={initial} />
    </div>
  )
}
