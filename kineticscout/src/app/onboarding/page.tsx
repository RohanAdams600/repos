import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AccountCompletionForm } from '@/components/auth/account-completion-form'
import { AthleteProfileForm } from '@/components/auth/athlete-profile-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { getAuthState } from '@/lib/auth/session'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'
import { gradYearBounds } from '@/lib/validation/profile'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).onboarding.title, robots: { index: false } }
}

export default async function OnboardingPage() {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect('/sign-in?next=/onboarding')
  const m = (await messages(authMessages)).onboarding

  if (state.status === 'needs-account') {
    return (
      <AuthShell title={m.finishTitle} intro={m.finishIntro}>
        <AccountCompletionForm />
      </AuthShell>
    )
  }

  if (state.user.role !== 'ATHLETE' || state.user.hasAthleteProfile) redirect('/dashboard')

  const { min, max } = gradYearBounds()
  const gradYears = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <AuthShell title={m.athleteTitle} intro={m.athleteIntro}>
      <AthleteProfileForm gradYears={gradYears} />
    </AuthShell>
  )
}
