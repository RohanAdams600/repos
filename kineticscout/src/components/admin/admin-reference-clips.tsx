'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field'
import { ProgressBar } from '@/components/ui/progress'
import { MOTION_LABELS, type Motion } from '@/lib/biomechanics/motions'
import { isAllowedVideoType } from '@/lib/storage/video-files'
import { putWithProgress } from '@/lib/upload/put'
import { readVideoMetadata } from '@/lib/upload/video-metadata'
import { errorMessage, useTRPC } from '@/trpc/client'

const EMPTY = { title: '', playerName: '', level: 'MLB', motionType: 'SWING' as Motion, handedness: 'RIGHT' as 'RIGHT' | 'LEFT', licensor: '', licenseReference: '', licenseExpiresAt: '', attribution: '', confirmed: false }

export function ReferenceClipAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const clips = useQuery(trpc.admin.referenceClips.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.referenceClips.queryKey() })
  const create = useMutation(trpc.admin.createReferenceClip.mutationOptions())
  const complete = useMutation(trpc.admin.completeReferenceClip.mutationOptions({ onSuccess: refresh }))
  const setActive = useMutation(trpc.admin.setReferenceClipActive.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.admin.deleteReferenceClip.mutationOptions({ onSuccess: refresh }))
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file || !isAllowedVideoType(file.type)) return setError('Choose an MP4 or MOV video.')
    try {
      const meta = await readVideoMetadata(file)
      const { clipId, upload } = await create.mutateAsync({
        title: form.title,
        playerName: form.playerName,
        level: form.level,
        motionType: form.motionType,
        handedness: form.handedness,
        contentType: file.type,
        sizeBytes: file.size,
        durationMs: meta.durationMs,
        width: meta.width,
        height: meta.height,
        licensor: form.licensor,
        licenseReference: form.licenseReference,
        licenseExpiresAt: form.licenseExpiresAt || null,
        attribution: form.attribution,
        licenseConfirmed: form.confirmed as true,
      })
      setProgress(0)
      await putWithProgress(upload.url, upload.headers, file, setProgress, new AbortController().signal)
      await complete.mutateAsync({ clipId })
      setForm(EMPTY)
      setFile(null)
      setProgress(null)
    } catch (err) {
      setProgress(null)
      setError(errorMessage(err))
    }
  }

  return (
    <section aria-labelledby="reference-admin-title" className="flex flex-col gap-4">
      <h2 id="reference-admin-title" className="text-2xl font-bold">
        Licensed reference clips
      </h2>
      <p className="text-fg-muted">
        Professional footage may be shown only under a written licence that covers display to users for comparison. Record the licensor and
        reference exactly as in the agreement. Clips stop playing automatically when the licence end date passes.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4 border-2 border-border-subtle p-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" name="refTitle" required>
            {(p) => <TextInput {...p} value={form.title} onChange={set('title')} />}
          </Field>
          <Field label="Player" name="refPlayer" required>
            {(p) => <TextInput {...p} value={form.playerName} onChange={set('playerName')} />}
          </Field>
          <Field label="Level" name="refLevel" required>
            {(p) => <TextInput {...p} value={form.level} onChange={set('level')} />}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Motion" name="refMotion" required>
              {(p) => (
                <Select {...p} value={form.motionType} onChange={set('motionType')}>
                  {(Object.keys(MOTION_LABELS) as Motion[]).map((m) => (
                    <option key={m} value={m}>
                      {MOTION_LABELS[m]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Side" name="refHand" required>
              {(p) => (
                <Select {...p} value={form.handedness} onChange={set('handedness')}>
                  <option value="RIGHT">Right</option>
                  <option value="LEFT">Left</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Licensor" name="refLicensor" required>
            {(p) => <TextInput {...p} value={form.licensor} onChange={set('licensor')} />}
          </Field>
          <Field label="Licence reference" name="refLicense" required>
            {(p) => <TextInput {...p} value={form.licenseReference} onChange={set('licenseReference')} />}
          </Field>
          <Field label="Licence ends (YYYY-MM-DD)" name="refExpires">
            {(p) => <TextInput {...p} value={form.licenseExpiresAt} onChange={set('licenseExpiresAt')} className="tabular" />}
          </Field>
          <Field label="Attribution shown to users" name="refAttribution" required>
            {(p) => <TextInput {...p} value={form.attribution} onChange={set('attribution')} />}
          </Field>
        </div>
        <Field label="Video" name="refFile" required>
          {(p) => <input {...p} type="file" accept="video/mp4,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <Checkbox name="refConfirm" required checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} label="I confirm the licence covers showing this footage to KineticScout users in side-by-side comparisons." />
        {progress !== null && <ProgressBar value={progress} label="Uploading reference clip" />}
        <Button type="submit" disabled={create.isPending || progress !== null} className="self-start">
          Upload and process
        </Button>
      </form>
      {clips.data?.length === 0 && <EmptyState title="No reference clips">Athletes can compare their own clips until licensed footage is added.</EmptyState>}
      <ul className="flex flex-col gap-3">
        {clips.data?.map((c) => {
          const expired = c.licenseExpired
          return (
            <li key={c.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
              <p className="font-bold">
                {c.playerName} ({c.level}): {c.title}
              </p>
              <p className="text-sm text-fg-muted">
                {MOTION_LABELS[c.motionType]}, {c.handedness === 'RIGHT' ? 'right' : 'left'}. Status: {c.status.toLowerCase().replace('_', ' ')}
                {c.errorCode ? ` (${c.errorCode})` : ''}. Licence {c.licenseReference} from {c.licensor}
                {c.licenseExpiresAt ? `, ends ${new Date(c.licenseExpiresAt).toISOString().slice(0, 10)}` : ''}
                {expired ? ' (expired)' : ''}.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" variant="secondary" disabled={c.status !== 'READY' || expired || setActive.isPending} aria-pressed={c.active} onClick={() => setActive.mutate({ clipId: c.id, active: !c.active })}>
                  {c.active ? 'Hide from athletes' : 'Show to athletes'}
                </Button>
                <ConfirmDialog
                  tone="danger"
                  title="Delete this clip?"
                  description="The video and its analysis are deleted. Athletes will no longer see it."
                  confirmLabel="Delete clip"
                  onConfirm={() => remove.mutate({ clipId: c.id })}
                  trigger={
                    <Button size="sm" variant="danger">
                      Delete
                    </Button>
                  }
                />
              </div>
            </li>
          )
        })}
      </ul>
      {(setActive.isError || remove.isError) && <Alert tone="error">{errorMessage(setActive.error ?? remove.error)}</Alert>}
    </section>
  )
}
