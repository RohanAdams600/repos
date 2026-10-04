import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/sign-in-form'
import { Alert } from '@/components/ui/alert'
import { safeRedirectPath } from '@/lib/security/origin'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

const NOTICES: Record<string, string> = {
  'link-expired': 'That link has expired or was already used. Sign in, or request a new link.',
  'email-confirmed': 'Your email is confirmed. Sign in to continue.',
}

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? safeRedirectPath(params.next) : undefined
  const notice = typeof params.notice === 'string' ? NOTICES[params.notice] : undefined
  return (
    <AuthShell title="Sign in">
      {notice && <Alert tone="info">{notice}</Alert>}
      <SignInForm next={next} />
    </AuthShell>
  )
}
