import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = { title: 'Check your email', robots: { index: false } }

export default function CheckEmailPage() {
  return (
    <AuthShell title="Check your email">
      <div className="flex flex-col gap-4 text-fg-muted">
        <p>We sent a confirmation link to the address you entered. Open it on this device to finish setting up your profile.</p>
        <p>The link expires in 24 hours. If nothing arrives within a few minutes, check your spam folder.</p>
        <p>
          Already confirmed? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  )
}
