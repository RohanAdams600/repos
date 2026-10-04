import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { confirmWorkEmailAction } from '@/lib/coach/actions'

export const metadata: Metadata = { title: 'Confirm your school email', robots: { index: false, follow: false } }

const RESULTS = {
  confirmed: { tone: 'success', text: 'School email confirmed. A KineticScout staff member will check your program staff directory, usually within 2 business days. We will email you when you are verified.' },
  invalid: { tone: 'error', text: 'This link is not valid or has expired. Sign in and submit your details again to get a new link.' },
  limited: { tone: 'error', text: 'Too many attempts. Try again in an hour.' },
} as const

export default async function VerifyCoachEmailPage({ searchParams }: PageProps<'/coach/verify-email'>) {
  const params = await searchParams
  const result = typeof params.result === 'string' && params.result in RESULTS ? RESULTS[params.result as keyof typeof RESULTS] : null
  const token = typeof params.token === 'string' ? params.token : ''
  return (
    <AuthShell title="Confirm your school email">
      {result ? (
        <Alert tone={result.tone} focusOnMount>
          {result.text} <Link href="/dashboard">Go to your dashboard</Link>
        </Alert>
      ) : token ? (
        <form action={confirmWorkEmailAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-fg-muted">Confirm that this school email address belongs to you so we can verify your coach account.</p>
          <Button type="submit" className="self-start">
            Confirm my school email
          </Button>
        </form>
      ) : (
        <Alert tone="error">This link is missing its code. Use the link in the email we sent.</Alert>
      )}
    </AuthShell>
  )
}
