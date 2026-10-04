import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { authMessages } from '@/i18n/messages/auth'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).checkEmail.title, robots: { index: false } }
}

export default async function CheckEmailPage() {
  const t = await messages(authMessages)
  const m = t.checkEmail
  return (
    <AuthShell title={m.title}>
      <div className="flex flex-col gap-4 text-fg-muted">
        <p>{m.sent}</p>
        <p>{m.expires}</p>
        <p>
          {m.already} <Link href="/sign-in">{t.signIn.submit}</Link>
        </p>
      </div>
    </AuthShell>
  )
}
