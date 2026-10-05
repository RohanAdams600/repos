import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SubmitButton } from '@/components/ui/submit-button'
import { linksMessages } from '@/i18n/messages/links'
import { messages } from '@/i18n/server'
import { verifyEmailLinkAction } from '@/lib/auth/actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(linksMessages)).confirm.title, robots: { index: false } }
}

export default async function ConfirmPage({ searchParams }: PageProps<'/auth/confirm'>) {
  const params = await searchParams
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : ''
  const type = typeof params.type === 'string' ? params.type : ''
  const next = typeof params.next === 'string' ? params.next : ''
  const isRecovery = type === 'recovery'
  const m = (await messages(linksMessages)).confirm

  return (
    <AuthShell
      title={isRecovery ? m.resetTitle : m.confirmTitle}
      intro={isRecovery ? m.resetIntro : m.confirmIntro}
    >
      <form action={verifyEmailLinkAction} className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <SubmitButton pendingLabel={m.checking}>{isRecovery ? m.continue : m.confirm}</SubmitButton>
      </form>
    </AuthShell>
  )
}
