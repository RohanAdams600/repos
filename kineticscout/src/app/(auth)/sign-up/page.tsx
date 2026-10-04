import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { Alert } from '@/components/ui/alert'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = (await messages(authMessages)).signUp
  return { title: m.title, description: m.description, alternates: { canonical: '/sign-up' } }
}

export default async function SignUpPage({ searchParams }: PageProps<'/sign-up'>) {
  const params = await searchParams
  const m = (await messages(authMessages)).signUp
  return (
    <AuthShell title={m.title} intro={m.intro}>
      {params.notice === 'unavailable' && <Alert tone="info">{m.unavailable}</Alert>}
      <SignUpForm />
    </AuthShell>
  )
}
