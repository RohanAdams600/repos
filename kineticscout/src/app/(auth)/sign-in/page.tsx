import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/sign-in-form'
import { Alert } from '@/components/ui/alert'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'
import { safeRedirectPath } from '@/lib/security/origin'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).signIn.title, robots: { index: false } }
}

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams
  const m = (await messages(authMessages)).signIn
  const next = typeof params.next === 'string' ? safeRedirectPath(params.next) : undefined
  const notice = typeof params.notice === 'string' ? m.notices[params.notice] : undefined
  return (
    <AuthShell title={m.title}>
      {notice && <Alert tone="info">{notice}</Alert>}
      <SignInForm next={next} />
    </AuthShell>
  )
}
