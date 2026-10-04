import { z } from 'zod'
import { isPlausibleDateOfBirth, parseDateOnly } from '@/lib/auth/age'
import { normalizeEmail } from '@/lib/security/sanitize'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/validation/constants'

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH }

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

export const emailSchema = z
  .string({ error: 'Enter your email address' })
  .trim()
  .min(1, 'Enter your email address')
  .max(254, 'Email address is too long')
  .pipe(z.email('Enter a valid email address'))
  .transform(normalizeEmail)

export const passwordSchema = z
  .string({ error: 'Enter a password' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)

export const dateOfBirthSchema = z
  .string({ error: 'Enter your date of birth' })
  .transform((value, ctx) => {
    const date = parseDateOnly(value)
    if (!date || !isPlausibleDateOfBirth(date)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid date of birth' })
      return z.NEVER
    }
    return date
  })

export const signUpSchema = z
  .object({
    accountType: z.enum(['ATHLETE', 'COACH'], { error: 'Choose an account type' }),
    email: emailSchema,
    password: passwordSchema,
    dateOfBirth: dateOfBirthSchema,
    guardianEmail: z.preprocess(emptyToUndefined, emailSchema.optional()),
    acceptTerms: z.literal('on', { error: 'Accept the Terms of Service and Privacy Policy to continue' }),
    marketingOptIn: z.preprocess(emptyToUndefined, z.literal('on').optional()),
  })
  .refine((data) => !data.guardianEmail || data.guardianEmail !== data.email, {
    path: ['guardianEmail'],
    message: "Use your parent or guardian's email address, not your own",
  })

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
  next: z.string().max(512).optional(),
})

export const passwordResetRequestSchema = z.object({ email: emailSchema })

export const passwordUpdateSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export const accountCompletionSchema = z.object({
  accountType: z.enum(['ATHLETE', 'COACH'], { error: 'Choose an account type' }),
  dateOfBirth: dateOfBirthSchema,
  guardianEmail: z.preprocess(emptyToUndefined, emailSchema.optional()),
  acceptTerms: z.literal('on', { error: 'Accept the Terms of Service and Privacy Policy to continue' }),
  marketingOptIn: z.preprocess(emptyToUndefined, z.literal('on').optional()),
})
