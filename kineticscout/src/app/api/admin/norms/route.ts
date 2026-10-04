import { isAdmin } from '@/lib/auth/permissions'
import { getSessionUser } from '@/lib/auth/session'
import { fieldErrorsFrom } from '@/lib/forms'
import { importNormDataset, normDatasetMetaSchema } from '@/lib/insights/norm-admin'
import { NORM_IMPORT_LIMITS } from '@/lib/insights/norms'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', ''])

/**
 * Staff upload of a licensed norm table (multipart: dataset fields plus a CSV file). A route
 * handler rather than tRPC because tables exceed the 64 KB API body cap. The dataset is stored as a
 * draft; staff activate it separately after previewing.
 */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const user = await getSessionUser()
  // Same answer as every other admin surface: non-admins cannot tell the route exists.
  if (!user || !isAdmin(user)) return Response.json({ error: 'Not found' }, { status: 404 })

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > NORM_IMPORT_LIMITS.maxBytes + 64_000) return Response.json({ ok: false, issues: [{ line: 0, message: 'The file is larger than 1 MB.' }] }, { status: 413 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, issues: [{ line: 0, message: 'Send the form as multipart/form-data.' }] }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return Response.json({ ok: false, issues: [], fieldErrors: { file: 'Choose a CSV file' } }, { status: 400 })
  if (file.size > NORM_IMPORT_LIMITS.maxBytes) return Response.json({ ok: false, issues: [], fieldErrors: { file: 'The file is larger than 1 MB.' } }, { status: 413 })
  if (!ALLOWED_TYPES.has(file.type) || !/\.(csv|txt)$/i.test(file.name)) return Response.json({ ok: false, issues: [], fieldErrors: { file: 'Upload a .csv file' } }, { status: 400 })

  const meta = normDatasetMetaSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')))
  if (!meta.success) return Response.json({ ok: false, issues: [], fieldErrors: fieldErrorsFrom(meta.error) }, { status: 400 })

  const text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer())
  const result = await importNormDataset(user.id, meta.data, text)
  return Response.json(result, { status: result.ok ? 201 : 422, headers: { 'Cache-Control': 'no-store' } })
}
