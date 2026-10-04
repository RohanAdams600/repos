'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { initialFormState } from '@/lib/forms'
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
          label="Make my profile public. Anyone with the link can see it; it is never listed in search engines."
        />
        <Checkbox name="showGpa" defaultChecked={showGpa} label="Show my GPA on the public profile and PDF." />
        <Checkbox name="showSchool" defaultChecked={showSchool} label="Show my high school on the public profile and PDF." />
        <SubmitButton pendingLabel="Saving" className="self-start">
          Save sharing settings
        </SubmitButton>
      </form>

      {isPublic && url && (
        <div className="flex flex-col gap-3 border-t-2 border-border-subtle pt-6">
          <p className="font-bold">Your profile link</p>
          <p className="tabular rounded-sm border-2 border-border-strong px-3 py-2 break-all">{url}</p>
          <div className="flex flex-wrap gap-3">
            <CopyButton value={url} label="Copy link" />
            <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center font-bold">
              Open public profile
            </a>
          </div>
          <p className="text-sm text-fg-muted">
            Last 30 days: <span className="tabular">{stats.views}</span> {stats.views === 1 ? 'view' : 'views'} and{' '}
            <span className="tabular">{stats.pdfDownloads}</span> PDF {stats.pdfDownloads === 1 ? 'download' : 'downloads'}. Your own visits and
            link previews are not counted.
          </p>
          <ConfirmDialog
            title="Create a new link?"
            description="Your current link stops working right away. Anyone you sent it to will need the new one."
            confirmLabel="Create new link"
            onConfirm={() => void rotateLinkAction()}
            trigger={
              <Button variant="secondary" size="sm" className="self-start">
                Create a new link
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
