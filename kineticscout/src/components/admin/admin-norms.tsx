'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, inputClass, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'
import { NORM_CSV_COLUMNS } from '@/lib/insights/norms'
import { errorMessage, useTRPC } from '@/trpc/client'

type ImportResponse =
  | { ok: true; datasetId: string; rowCount: number; metrics: string[] }
  | { ok: false; issues: { line: number; message: string }[]; fieldErrors?: Partial<Record<string, string>> }

const STATUS_LABEL = { DRAFT: 'Draft (not shown to users)', ACTIVE: 'Active', RETIRED: 'Retired' } as const

function ImportForm({ onImported }: { onImported: () => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    try {
      const response = await fetch('/api/admin/norms', { method: 'POST', body: new FormData(event.currentTarget), signal: AbortSignal.timeout(60_000) })
      const body = (await response.json().catch(() => null)) as ImportResponse | null
      if (!body) throw new Error(`Upload failed (${response.status}).`)
      setResult(body)
      if (body.ok) {
        formRef.current?.reset()
        onImported()
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4 border-2 border-border-subtle p-4">
      <h3 className="text-xl font-bold">Import a table</h3>
      {failure && <Alert tone="error">{failure}</Alert>}
      {result?.ok && (
        <Alert tone="success" focusOnMount>
          Imported as a draft: <span className="tabular">{result.rowCount}</span> rows covering {result.metrics.join(', ')}. Preview it below, then activate it.
        </Alert>
      )}
      {result && !result.ok && result.issues.length > 0 && (
        <Alert tone="error" title="Nothing was imported" focusOnMount>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {result.issues.map((i, n) => (
              <li key={n}>
                {i.line > 0 ? <span className="tabular">Line {i.line}: </span> : null}
                {i.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Table name" name="name" required error={fieldErrors.name}>
          {(p) => <TextInput {...p} maxLength={160} />}
        </Field>
        <Field label="Publisher" name="publisher" required error={fieldErrors.publisher}>
          {(p) => <TextInput {...p} maxLength={160} />}
        </Field>
        <Field label="Edition or year" name="edition" required error={fieldErrors.edition}>
          {(p) => <TextInput {...p} maxLength={40} />}
        </Field>
        <Field label="Source link" name="sourceUrl" required error={fieldErrors.sourceUrl} hint="The publisher's page for this table (https).">
          {(p) => <TextInput {...p} type="url" inputMode="url" maxLength={512} />}
        </Field>
      </div>
      <Field label="Who was measured" name="population" required error={fieldErrors.population} hint="As the publisher describes it. Shown next to every national figure.">
        {(p) => <textarea {...p} rows={2} maxLength={400} className={cn(inputClass, 'py-2')} />}
      </Field>
      <Field label="Licence terms" name="licence" required error={fieldErrors.licence} hint="What the licence allows, and its reference number if there is one.">
        {(p) => <textarea {...p} rows={3} maxLength={1000} className={cn(inputClass, 'py-2')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Licence ends" name="licenceExpiresAt" error={fieldErrors.licenceExpiresAt} hint="The table stops being used the day after.">
          {(p) => <TextInput {...p} type="date" />}
        </Field>
        <Field label="CSV file" name="file" required error={fieldErrors.file} hint="Up to 1 MB and 5,000 rows.">
          {(p) => <TextInput {...p} type="file" accept=".csv,text/csv" className="py-2" />}
        </Field>
      </div>
      <Checkbox name="licenceConfirmed" required error={fieldErrors.licenceConfirmed} label="I confirm the licence allows showing these figures to KineticScout users next to their own results." />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? <Spinner label="Importing" /> : null}
        Import as draft
      </Button>
    </form>
  )
}

function Preview({ datasetId, metrics }: { datasetId: string; metrics: { metricType: string; label: string }[] }) {
  const trpc = useTRPC()
  const [form, setForm] = useState({ metricType: metrics[0]?.metricType ?? '', value: '', age: '16', heightInches: '70', weightLbs: '170' })
  type Input = Parameters<typeof trpc.admin.previewNorm.queryOptions>[0]
  const [query, setQuery] = useState<Exclude<Input, typeof skipToken> | null>(null)
  const preview = useQuery(trpc.admin.previewNorm.queryOptions(query ?? skipToken))
  const id = (k: string) => `preview-${datasetId}-${k}`

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setQuery({ datasetId, metricType: form.metricType as Exclude<Input, typeof skipToken>['metricType'], value: Number(form.value), age: Number(form.age), heightInches: Number(form.heightInches), weightLbs: Number(form.weightLbs) })
      }}
    >
      <p className="font-bold">Check a value against this table</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Metric" name={id('metric')} required>
          {(p) => (
            <Select {...p} value={form.metricType} onChange={(e) => setForm({ ...form, metricType: e.target.value })}>
              {metrics.map((m) => (
                <option key={m.metricType} value={m.metricType}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {(['value', 'age', 'heightInches', 'weightLbs'] as const).map((k) => (
          <Field key={k} label={{ value: 'Value', age: 'Age', heightInches: 'Height (in)', weightLbs: 'Weight (lb)' }[k]} name={id(k)} required>
            {(p) => <TextInput {...p} inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <Button type="submit" size="sm" variant="secondary" className="self-start">
        Check
      </Button>
      <div aria-live="polite">
        {preview.isFetching && <Spinner label="Checking" />}
        {preview.isError && <Alert tone="error">{errorMessage(preview.error)}</Alert>}
        {preview.data &&
          (preview.data.covered ? (
            <p>
              Better than <span className="tabular font-bold">{preview.data.percentile}%</span> ({preview.data.bandLabel}, <span className="tabular">n = {preview.data.sampleSize}</span>; p10 to p90{' '}
              <span className="tabular">
                {preview.data.quantiles.p10} to {preview.data.quantiles.p90}
              </span>
              ).
            </p>
          ) : (
            <p className="text-fg-muted">No band in this table covers that athlete.</p>
          ))}
      </div>
    </form>
  )
}

export function NormsAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const datasets = useQuery(trpc.admin.normDatasets.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.normDatasets.queryKey() })
  const setStatus = useMutation(trpc.admin.setNormDatasetStatus.mutationOptions({ onSuccess: refresh }))

  return (
    <section aria-labelledby="norms-admin-title" className="flex flex-col gap-4">
      <h2 id="norms-admin-title" className="text-2xl font-bold">
        National norms
      </h2>
      <p className="text-fg-muted">
        Import only tables the business licenses. One row per metric and band of age, height and weight, with the sample size and the raw values
        at the 10th, 25th, 50th, 75th and 90th percentile in ascending order (for timed events p10 is the fast end). Leave a band&apos;s min and max
        empty to cover all values. Bands for a metric must be separate or fully nested. When several active tables cover an athlete, the most
        recently activated one is used.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="tabular text-sm break-all">{NORM_CSV_COLUMNS.join(',')}</code>
        <CopyButton value={NORM_CSV_COLUMNS.join(',')} label="Copy header row" />
      </div>
      <ImportForm onImported={() => void refresh()} />

      {setStatus.isError && <Alert tone="error">{errorMessage(setStatus.error)}</Alert>}
      {datasets.isPending && <Spinner label="Loading tables" />}
      {datasets.isError && <Alert tone="error">{errorMessage(datasets.error)}</Alert>}
      {datasets.data?.length === 0 && <EmptyState title="No tables yet">Until a table is active, athletes see only KineticScout comparisons.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {datasets.data?.map((d) => (
          <li key={d.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">
                {d.publisher}: {d.name}, {d.edition}
              </p>
              <p className="text-sm font-bold">{STATUS_LABEL[d.status]}</p>
            </div>
            <p className="text-sm text-fg-muted">{d.population}</p>
            <p className="text-sm">
              <span className="tabular">{d.rowCount}</span> rows: {d.metrics.map((m) => `${m.label} (${m.rows})`).join(', ')}.
            </p>
            <p className="text-sm text-fg-muted">
              Licence: {d.licence} {d.licenceExpiresAt ? <span className="tabular">Ends {d.licenceExpiresAt}.</span> : 'No end date.'}{' '}
              <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                Source
              </a>
            </p>
            {d.activatedAt && <p className="tabular text-sm text-fg-muted">Activated {d.activatedAt.slice(0, 10)}{d.retiredAt ? `, retired ${d.retiredAt.slice(0, 10)}` : ''}</p>}
            <Preview datasetId={d.id} metrics={d.metrics} />
            <div className="flex flex-wrap gap-3">
              {d.status !== 'ACTIVE' && (
                <ConfirmDialog
                  trigger={<Button size="sm">Activate</Button>}
                  title="Activate this table?"
                  description="Athletes covered by its bands will see their national standing from this table at once, with its name and publisher."
                  confirmLabel="Activate"
                  onConfirm={() => setStatus.mutate({ datasetId: d.id, action: 'activate' })}
                />
              )}
              {d.status === 'ACTIVE' && (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="secondary">Retire</Button>}
                  title="Retire this table?"
                  description="National figures from it stop at once. It stays on record and can be activated again."
                  confirmLabel="Retire"
                  onConfirm={() => setStatus.mutate({ datasetId: d.id, action: 'retire' })}
                />
              )}
              {d.status === 'DRAFT' && (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="danger">Delete draft</Button>}
                  title="Delete this draft?"
                  description="The imported rows are removed. A table that was ever active can only be retired."
                  confirmLabel="Delete"
                  tone="danger"
                  onConfirm={() => setStatus.mutate({ datasetId: d.id, action: 'delete' })}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
