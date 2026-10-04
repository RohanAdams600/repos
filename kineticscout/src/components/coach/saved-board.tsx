'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ContactDialog } from '@/components/coach/contact-dialog'
import { ProspectCard } from '@/components/coach/prospect-card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

function NoteEditor({ athleteId, note }: { athleteId: string; note: string | null }) {
  const trpc = useTRPC()
  const [value, setValue] = useState(note ?? '')
  const save = useMutation(trpc.coach.note.mutationOptions())
  const id = `note-${athleteId}`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        Private note <span className="font-normal text-fg-muted">(only you can see it)</span>
      </label>
      <textarea id={id} rows={3} maxLength={1000} value={value} onChange={(e) => setValue(e.target.value)} className="rounded-sm border-2 border-border-strong bg-bg p-2" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={save.isPending || value === (note ?? '')} onClick={() => save.mutate({ athleteId, note: value || null })}>
          Save note
        </Button>
        <span aria-live="polite" className="text-sm text-fg-muted">
          {save.isSuccess ? 'Saved' : save.isError ? errorMessage(save.error) : ''}
        </span>
      </div>
    </div>
  )
}

export function SavedBoard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const board = useQuery(trpc.coach.board.queryOptions())
  const remove = useMutation(trpc.coach.unsave.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.coach.board.queryKey() }) }))
  if (board.isPending) return <Spinner label="Loading saved prospects" />
  if (board.isError) return <Alert tone="error">{errorMessage(board.error)}</Alert>
  if (board.data.length === 0) return <EmptyState title="No saved prospects">Save athletes from prospect search to keep them here with your notes.</EmptyState>
  return (
    <ul className="flex flex-col gap-4">
      {board.data.map((entry) => (
        <li key={entry.athleteId} className="flex flex-col gap-4 border-2 border-border-subtle p-4">
          {entry.card ? (
            <ProspectCard card={entry.card} actions={<ContactDialog athleteId={entry.athleteId} athleteName={entry.card.firstName} gradYear={entry.card.gradYear} />} />
          ) : (
            <p className="text-fg-muted">This athlete&apos;s profile is no longer public. Your note is kept until you remove them.</p>
          )}
          <NoteEditor athleteId={entry.athleteId} note={entry.note} />
          <Button size="sm" variant="ghost" className="self-start" onClick={() => remove.mutate({ athleteId: entry.athleteId })}>
            Remove from saved
          </Button>
        </li>
      ))}
    </ul>
  )
}
