import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { linksMessages } from '@/i18n/messages/links'
import { messages } from '@/i18n/server'
import { confirmWorkEmailAction } from '@/lib/coach/actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(linksMessages)).coachEmail.title, robots: { index: false, follow: false } }
}

const RESULTS = { confirmed: 'success', invalid: 'error', limited: 'error' } as const

export default async function VerifyCoachEmailPage({ searchParams }: PageProps<'/coach/verify-email'>) {
  const params = await searchParams
  const m = (await messages(linksMessages)).coachEmail
  const result = typeof params.result === 'string' && params.result in RESULTS ? (params.result as keyof typeof RESULTS) : null
  const token = typeof params.token === 'string' ? params.token : ''
  return (
    <AuthShell title={m.title}>
      {result ? (
        <Alert tone={RESULTS[result]} focusOnMount>
          {m.results[result]} <Link href="/dashboard">{m.dashboard}</Link>
        </Alert>
      ) : token ? (
        <form action={confirmWorkEmailAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-fg-muted">{m.intro}</p>
          <Button type="submit" className="self-start">
            {m.submit}
          </Button>
        </form>
      ) : (
        <Alert tone="error">{m.missing}</Alert>
      )}
    </AuthShell>
  )
}
