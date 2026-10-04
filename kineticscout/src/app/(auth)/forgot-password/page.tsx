import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { RequestResetForm } from '@/components/auth/password-reset-forms'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).reset.forgotTitle, robots: { index: false } }
}

export default async function ForgotPasswordPage() {
  const m = (await messages(authMessages)).reset
  return (
    <AuthShell title={m.forgotTitle} intro={m.forgotIntro}>
      <RequestResetForm />
    </AuthShell>
  )
}
