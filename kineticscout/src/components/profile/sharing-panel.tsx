'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { initialFormState } from '@/lib/forms'
import { useMessages } from '@/i18n/client'
import { accountMessages } from '@/i18n/messages/account'
import { rotateLinkAction, updateVisibilityAction } from '@/lib/profile/actions'

type Props = {
  canPublish: boolean
  isPublic: boolean
  showGpa: boolean
  showSchool: boolean
  url: string | null
  stats: { views: number; pdfDownloads: number }
}

export function SharingPanel({ canPublish, isPublic, showGpa, showSchool, url, stats }: Props) {
  const [state, action] = useActionState(updateVisibilityAction, initialFormState)
  const t = useMessages(accountMessages)
  const m = t.sharing
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        {state.status === 'error' && (
          <Alert tone="error" focusOnMount>
            {state.message}
          </Alert>
        )}
        {state.status === 'success' && (
          <Alert tone="success" focusOnMount>
            {state.message}
          </Alert>
        )}
        <Checkbox
          name="isPublic"
          defaultChecked={isPublic}
          disabled={!canPublish}
          label={m.public}
        />
        <Checkbox name="showGpa" defaultChecked={showGpa} label={m.gpa} />
        <Checkbox name="showSchool" defaultChecked={showSchool} label={m.school} />
        <SubmitButton pendingLabel={t.saving} className="self-start">
          {m.save}
        </SubmitButton>
      </form>

      {isPublic && url && (
        <div className="flex flex-col gap-3 border-t-2 border-border-subtle pt-6">
          <p className="font-bold">{m.link}</p>
          <p className="tabular rounded-sm border-2 border-border-strong px-3 py-2 break-all">{url}</p>
          <div className="flex flex-wrap gap-3">
            <CopyButton value={url} label={m.copy} />
            <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center font-bold">
              {m.open}
            </a>
          </div>
          <p className="text-sm text-fg-muted">{m.stats(stats.views, stats.pdfDownloads)}</p>
          <ConfirmDialog
            title={m.rotateTitle}
            description={m.rotateBody}
            confirmLabel={m.rotate}
            onConfirm={() => void rotateLinkAction()}
            trigger={
              <Button variant="secondary" size="sm" className="self-start">
                {m.rotateTrigger}
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
