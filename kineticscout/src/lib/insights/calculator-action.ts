'use server'

import { z } from 'zod'
import { MetricType } from '@/generated/prisma/enums'
import { biometricPercentile } from '@/lib/insights/service'
import { METRIC_DEFINITIONS, isPlausibleMetricValue } from '@/lib/metrics/definitions'
import { fieldErrorsFrom, formValues } from '@/lib/forms'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

/** `values` echoes the inputs so the form keeps them after React resets it. */
export type CalculatorState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<string, string>>; values: Record<string, string> }
  | { status: 'result'; metricLabel: string; valueLabel: string; percentile: number; cohortSize: number; bandsLabel: string; values: Record<string, string> }
  | { status: 'insufficient'; metricLabel: string; values: Record<string, string> }

const schema = z
  .object({
    metricType: z.enum(MetricType, { error: 'Choose a measurement' }),
    value: z.coerce.number({ error: 'Enter your result' }).finite(),
    age: z.coerce.number({ error: 'Enter your age' }).int('Enter whole years').min(13, 'Ages 13 to 25').max(25, 'Ages 13 to 25'),
    heightFeet: z.coerce.number({ error: 'Enter feet' }).int().min(4, 'Enter 4 to 7 feet').max(7, 'Enter 4 to 7 feet'),
    heightInches: z.coerce.number({ error: 'Enter inches' }).int().min(0, 'Enter 0 to 11 inches').max(11, 'Enter 0 to 11 inches'),
    weightLbs: z.coerce.number({ error: 'Enter your weight' }).int('Enter whole pounds').min(70, 'Enter 70 to 400 lb').max(400, 'Enter 70 to 400 lb'),
  })
  .superRefine((v, ctx) => {
    const def = METRIC_DEFINITIONS[v.metricType]
    if (!isPlausibleMetricValue(v.metricType, v.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: `Enter ${def.min} to ${def.max} ${def.unit}` })
  })

/**
 * Anonymous calculator. Nothing typed here is stored. Results are rounded to the nearest 5 points
 * and need a cohort of at least K_MIN athletes, so the tool cannot be used to read off individual
 * athletes' numbers.
 */
export async function calculatePercentileAction(_prev: CalculatorState, formData: FormData): Promise<CalculatorState> {
  const values = formValues(formData)
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  if (!(await rateLimit('calculator', await hashedClientIp())).success) return { status: 'error', message: 'Too many calculations. Try again in an hour.', values }
  const input = parsed.data
  const def = METRIC_DEFINITIONS[input.metricType]
  const result = await biometricPercentile({
    metricType: input.metricType,
    value: input.value,
    age: input.age,
    heightInches: input.heightFeet * 12 + input.heightInches,
    weightLbs: input.weightLbs,
  })
  if (result.status === 'insufficient') return { status: 'insufficient', metricLabel: def.label, values }
  return {
    status: 'result',
    metricLabel: def.label,
    valueLabel: `${input.value.toFixed(def.decimals)} ${def.unit}`,
    percentile: Math.min(95, Math.max(5, Math.round(result.percentile / 5) * 5)),
    cohortSize: result.cohortSize,
    bandsLabel: result.bandsLabel,
    values,
  }
}
