import { z } from 'zod'
import { Handedness, Position, Sport } from '@/generated/prisma/enums'
import { positionBelongsToSport } from '@/lib/athletes/positions'
import { sanitizeText } from '@/lib/security/sanitize'

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

const personName = (label: string) =>
  z
    .string({ error: `Enter your ${label}` })
    .transform((value) => sanitizeText(value))
    .pipe(
      z
        .string()
        .min(1, `Enter your ${label}`)
        .max(50, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`)
        .regex(/^[\p{L}\p{M}' .-]+$/u, `Use letters, spaces, apostrophes or hyphens in your ${label}`),
    )

export function gradYearBounds(now: Date = new Date()): { min: number; max: number } {
  const year = now.getUTCFullYear()
  return { min: year, max: year + 6 }
}

export const athleteProfileSchema = z
  .object({
    firstName: personName('first name'),
    lastName: personName('last name'),
    sport: z.enum(Sport).default('BASEBALL'),
    primaryPosition: z.enum(Position, { error: 'Choose your primary position' }),
    gradYear: z.coerce
      .number({ error: 'Enter your graduation year' })
      .int('Enter a four-digit year')
      .refine((year) => {
        const { min, max } = gradYearBounds()
        return year >= min && year <= max
      }, 'Enter your high school graduation year'),
    heightInches: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int('Enter whole inches').min(48, 'Enter height in inches (48 to 96)').max(96, 'Enter height in inches (48 to 96)').optional(),
    ),
    weightLbs: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int('Enter whole pounds').min(70, 'Enter weight in pounds (70 to 400)').max(400, 'Enter weight in pounds (70 to 400)').optional(),
    ),
    gpa: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(/^[0-5](\.\d{1,2})?$/, 'Enter GPA as a number like 3.75')
        .transform(Number)
        .refine((v) => v <= 5, 'GPA must be between 0.00 and 5.00')
        .optional(),
    ),
    highSchool: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .transform((v) => sanitizeText(v))
        .pipe(z.string().min(2, 'High school name is too short').max(120, 'High school name is too long'))
        .optional(),
    ),
    twitterHandle: z.preprocess(
      (value) => (typeof value === 'string' ? emptyToUndefined(value.trim().replace(/^@/, '')) : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_]{1,15}$/, 'X handles use up to 15 letters, numbers or underscores')
        .optional(),
    ),
    bats: z.preprocess(emptyToUndefined, z.enum(Handedness).optional()),
    throws: z.preprocess(emptyToUndefined, z.enum(Handedness).optional()),
  })
  .refine((data) => positionBelongsToSport(data.primaryPosition, data.sport), {
    path: ['primaryPosition'],
    message: 'That position does not belong to the selected sport',
  })

export type AthleteProfileInput = z.infer<typeof athleteProfileSchema>
