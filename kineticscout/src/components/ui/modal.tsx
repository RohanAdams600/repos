'use client'

import * as RadixDialog from '@radix-ui/react-dialog'
import { useMessages } from '@/i18n/client'
import { uiMessages } from '@/i18n/messages/ui'
import type { ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

/** Modal with arbitrary content: focus is trapped, Escape closes, focus returns to the trigger. */
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; children: ReactNode }) {
  const ui = useMessages(uiMessages)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100%-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-border-strong bg-bg p-6">
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-xl font-bold">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={ui.close}>
                <CloseIcon />
              </Button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description asChild>
              <div className="mt-2 text-fg-muted">{description}</div>
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
