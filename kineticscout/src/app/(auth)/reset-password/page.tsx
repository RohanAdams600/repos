import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { UpdatePasswordForm } from '@/components/auth/password-reset-forms'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).reset.newTitle, robots: { index: false } }
}

export default async function ResetPasswordPage() {
  const m = (await messages(authMessages)).reset
  return (
    <AuthShell title={m.newTitle} intro={m.newIntro}>
      <UpdatePasswordForm />
    </AuthShell>
  )
}
