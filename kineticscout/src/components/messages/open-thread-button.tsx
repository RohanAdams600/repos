'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/client'
import { connectionsMessages } from '@/i18n/messages/connections'
import { errorMessage, useTRPC } from '@/trpc/client'

/** Opens (or creates) the conversation for an accepted contact request and goes to it. */
export function OpenThreadButton({ contactRequestId, label }: { contactRequestId: string; label?: string }) {
  const m = useMessages(connectionsMessages).messages
  const trpc = useTRPC()
  const router = useRouter()
  const open = useMutation(trpc.messages.open.mutationOptions({ onSuccess: (r) => router.push(`/dashboard/messages/${r.threadId}`) }))
  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="secondary" disabled={open.isPending} onClick={() => open.mutate({ contactRequestId })} className="self-start">
        {label ?? m.open}
      </Button>
      {open.isError && <Alert tone="error">{errorMessage(open.error)}</Alert>}
    </div>
  )
}
