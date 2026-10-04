import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SubmitButton } from '@/components/ui/submit-button'
import { verifyEmailLinkAction } from '@/lib/auth/actions'

export const metadata: Metadata = { title: 'Confirm', robots: { index: false } }

export default async function ConfirmPage({ searchParams }: PageProps<'/auth/confirm'>) {
  const params = await searchParams
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : ''
  const type = typeof params.type === 'string' ? params.type : ''
  const next = typeof params.next === 'string' ? params.next : ''
  const isRecovery = type === 'recovery'

  return (
    <AuthShell
      title={isRecovery ? 'Reset your password' : 'Confirm your email'}
      intro={isRecovery ? 'Continue to choose a new password.' : 'One more step to activate your KineticScout account.'}
    >
      <form action={verifyEmailLinkAction} className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <SubmitButton pendingLabel="Checking link">{isRecovery ? 'Continue' : 'Confirm my email'}</SubmitButton>
      </form>
    </AuthShell>
  )
}
