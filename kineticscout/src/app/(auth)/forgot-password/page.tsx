import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { RequestResetForm } from '@/components/auth/password-reset-forms'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } }

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter the email you signed up with and we will send you a reset link.">
      <RequestResetForm />
    </AuthShell>
  )
}
