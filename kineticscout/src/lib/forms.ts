import type { z } from 'zod'

/** Shared shape returned by every Server Action form (consumed with useActionState). */
export type FormState =
  | { status: 'idle' }
  | {
      status: 'error'
      message: string
      fieldErrors?: Partial<Record<string, string>>
      /** Echo of non-secret inputs so React's post-action form reset restores them. Never passwords. */
      values?: Record<string, string>
    }
  | { status: 'success'; message: string }

export const initialFormState: FormState = { status: 'idle' }

export function fieldErrorsFrom(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form'
    out[key] ??= issue.message
  }
  return out
}

/** FormData to a plain object, keeping only string values and dropping secrets from echoes. */
export function formValues(formData: FormData, omit: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !omit.includes(key) && !key.startsWith('$ACTION')) out[key] = value
  }
  return out
}
