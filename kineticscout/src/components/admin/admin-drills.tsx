'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { FINDING_CODES, FOCUS_LABEL, MOTION_LABEL } from '@/lib/training/rules'
import { errorMessage, useTRPC } from '@/trpc/client'

const MOTIONS = ['SWING', 'PITCH', 'HOCKEY_SHOT', 'FOOTBALL_THROW'] as const
const EMPTY = { title: '', sport: 'BASEBALL', summary: '', steps: '', equipment: '', minutes: '15', safetyNote: '', source: 'STAFF', author: '', licensor: '', licenceRef: '', licenceExpiresAt: '' }
const textareaClass = 'block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg'

export function DrillsAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const drills = useQuery(trpc.admin.drills.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.drills.queryKey() })
  const [form, setForm] = useState(EMPTY)
  const [motions, setMotions] = useState<string[]>([])
  const [focus, setFocus] = useState<string[]>([])
  const create = useMutation(trpc.admin.createDrill.mutationOptions({ onSuccess: () => { setForm(EMPTY); setMotions([]); setFocus([]); void refresh() } }))
  const status = useMutation(trpc.admin.setDrillStatus.mutationOptions({ onSuccess: () => void refresh() }))
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <section aria-labelledby="drills-admin-title" className="flex flex-col gap-4">
      <h2 id="drills-admin-title" className="text-2xl font-bold">
        Drill library
      </h2>
      <p className="text-fg-muted">
        Drills are written by a named staff coach or licensed, and published by a second staff member. Describe what to do and how to stay safe; never promise speed, velocity
        or recruiting results.
      </p>
      <form
        className="flex flex-col gap-4 border-2 border-border-subtle p-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate({ ...form, motionTypes: motions, focusCodes: focus, steps: form.steps.split('\n').map((s) => s.trim()).filter(Boolean) })
        }}
      >
        {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
        <Field label="Title" name="drill-title" required>
          {(p) => <TextInput {...p} maxLength={120} value={form.title} onChange={set('title')} />}
        </Field>
        <Field label="Sport" name="drill-sport" required>
          {(p) => (
            <Select {...p} value={form.sport} onChange={set('sport')}>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
            </Select>
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-bold">Motions</legend>
          {MOTIONS.map((m) => (
            <Checkbox key={m} name={`drill-motion-${m}`} checked={motions.includes(m)} onChange={() => toggle(motions, setMotions, m)} label={MOTION_LABEL[m]} />
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-bold">Focus areas it works on</legend>
          {FINDING_CODES.map((c) => (
            <Checkbox key={c} name={`drill-focus-${c}`} checked={focus.includes(c)} onChange={() => toggle(focus, setFocus, c)} label={FOCUS_LABEL[c]} />
          ))}
        </fieldset>
        <Field label="Summary" name="drill-summary" required>
          {(p) => <TextInput {...p} maxLength={300} value={form.summary} onChange={set('summary')} />}
        </Field>
        <Field label="Steps" name="drill-steps" required hint="One step per line, up to 8.">
          {(p) => <textarea {...p} rows={6} value={form.steps} onChange={set('steps')} className={textareaClass} />}
        </Field>
        <Field label="Equipment" name="drill-equipment">
          {(p) => <TextInput {...p} maxLength={200} value={form.equipment} onChange={set('equipment')} />}
        </Field>
        <Field label="Minutes" name="drill-minutes" required>
          {(p) => <TextInput {...p} inputMode="numeric" value={form.minutes} onChange={set('minutes')} />}
        </Field>
        <Field label="Safety note" name="drill-safety" required>
          {(p) => <TextInput {...p} maxLength={300} value={form.safetyNote} onChange={set('safetyNote')} />}
        </Field>
        <Field label="Source" name="drill-source" required>
          {(p) => (
            <Select {...p} value={form.source} onChange={set('source')}>
              <option value="STAFF">Written by our staff</option>
              <option value="LICENSED">Licensed</option>
            </Select>
          )}
        </Field>
        <Field label="Author and credential" name="drill-author" required hint="For example: Jordan Lee, USA Baseball certified coach.">
          {(p) => <TextInput {...p} maxLength={160} value={form.author} onChange={set('author')} />}
        </Field>
        {form.source === 'LICENSED' && (
          <>
            <Field label="Licensor" name="drill-licensor" required>
              {(p) => <TextInput {...p} maxLength={160} value={form.licensor} onChange={set('licensor')} />}
            </Field>
            <Field label="Licence reference" name="drill-licence-ref" required>
              {(p) => <TextInput {...p} maxLength={200} value={form.licenceRef} onChange={set('licenceRef')} />}
            </Field>
            <Field label="Licence ends" name="drill-licence-ends">
              {(p) => <TextInput {...p} type="date" value={form.licenceExpiresAt} onChange={set('licenceExpiresAt')} />}
            </Field>
          </>
        )}
        <Button type="submit" disabled={create.isPending} className="self-start">
          Save as draft
        </Button>
      </form>
      {status.isError && <Alert tone="error">{errorMessage(status.error)}</Alert>}
      {drills.isPending && <Spinner label="Loading drills" />}
      {drills.data?.length === 0 && <EmptyState title="No drills yet">Training plans can only be built once drills covering the analysis focus areas are published.</EmptyState>}
      <ul className="flex flex-col gap-3">
        {drills.data?.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
            <p className="font-bold">
              {d.title} <span className="font-normal text-fg-muted">({d.status.toLowerCase()})</span>
            </p>
            <p className="text-sm text-fg-muted">
              {d.motionTypes.map((m) => MOTION_LABEL[m]).join(', ')}. Focus: {d.focusCodes.map((c) => FOCUS_LABEL[c as keyof typeof FOCUS_LABEL] ?? c).join(', ')}. {d.author}
              {d.licensor ? `, licensed from ${d.licensor}${d.licenceExpiresAt ? ` until ${d.licenceExpiresAt}` : ''}` : ''}.
            </p>
            <ol className="list-decimal pl-5 text-sm">
              {d.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              {d.status === 'DRAFT' ? (
                <>
                  <Button size="sm" disabled={status.isPending || d.mine} onClick={() => status.mutate({ drillId: d.id, action: 'publish' })}>
                    Publish
                  </Button>
                  {d.mine && <span className="self-center text-sm text-fg-muted">Another staff member must review and publish your drill.</span>}
                  <Button size="sm" variant="secondary" disabled={status.isPending} onClick={() => status.mutate({ drillId: d.id, action: 'delete' })}>
                    Delete draft
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" disabled={status.isPending} onClick={() => status.mutate({ drillId: d.id, action: 'retire' })}>
                  Retire
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
