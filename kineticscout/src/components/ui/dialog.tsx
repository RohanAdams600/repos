'use client'

import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

type ConfirmDialogProps = {
  trigger: ReactNode
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  tone?: 'primary' | 'danger'
}

/** Confirmation modal: focus is trapped, Escape closes, and focus returns to the trigger. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, tone = 'primary' }: ConfirmDialogProps) {
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 border-2 border-border-strong bg-bg p-6">
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-xl font-bold">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <CloseIcon />
              </Button>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description asChild>
            <div className="mt-3 text-fg-muted">{description}</div>
          </RadixDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <RadixDialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </RadixDialog.Close>
            <RadixDialog.Close asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </RadixDialog.Close>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
