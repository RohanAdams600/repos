'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { errorMessage, useTRPC } from '@/trpc/client'

/** Opens (or creates) the conversation for an accepted contact request and goes to it. */
export function OpenThreadButton({ contactRequestId, label = 'Message' }: { contactRequestId: string; label?: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const open = useMutation(trpc.messages.open.mutationOptions({ onSuccess: (r) => router.push(`/dashboard/messages/${r.threadId}`) }))
  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="secondary" disabled={open.isPending} onClick={() => open.mutate({ contactRequestId })} className="self-start">
        {label}
      </Button>
      {open.isError && <Alert tone="error">{errorMessage(open.error)}</Alert>}
    </div>
  )
}
