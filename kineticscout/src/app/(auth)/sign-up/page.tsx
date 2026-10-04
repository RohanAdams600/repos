import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { Alert } from '@/components/ui/alert'

export const metadata: Metadata = {
  title: 'Create your free profile',
  description: 'Create a free KineticScout profile to log your measurables and see your class percentile.',
  alternates: { canonical: '/sign-up' },
}

export default async function SignUpPage({ searchParams }: PageProps<'/sign-up'>) {
  const params = await searchParams
  return (
    <AuthShell title="Create your free profile" intro="Free forever for up to 3 metrics a month. No card required.">
      {params.notice === 'unavailable' && <Alert tone="info">Sorry, we can&apos;t create a KineticScout account for you.</Alert>}
      <SignUpForm />
    </AuthShell>
  )
}
