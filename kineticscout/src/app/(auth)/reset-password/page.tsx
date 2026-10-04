import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { UpdatePasswordForm } from '@/components/auth/password-reset-forms'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" intro="Other devices will be signed out after you save.">
      <UpdatePasswordForm />
    </AuthShell>
  )
}
