import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AccountCompletionForm } from '@/components/auth/account-completion-form'
import { AthleteProfileForm } from '@/components/auth/athlete-profile-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { getAuthState } from '@/lib/auth/session'
import { gradYearBounds } from '@/lib/validation/profile'

export const metadata: Metadata = { title: 'Set up your profile', robots: { index: false } }

export default async function OnboardingPage() {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect('/sign-in?next=/onboarding')

  if (state.status === 'needs-account') {
    return (
      <AuthShell title="Finish creating your account" intro="We need a few details before you can continue.">
        <AccountCompletionForm />
      </AuthShell>
    )
  }

  if (state.user.role !== 'ATHLETE' || state.user.hasAthleteProfile) redirect('/dashboard')

  const { min, max } = gradYearBounds()
  const gradYears = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <AuthShell title="Set up your athlete profile" intro="This is what powers your percentiles and college matches. You can edit it later.">
      <AthleteProfileForm gradYears={gradYears} />
    </AuthShell>
  )
}
