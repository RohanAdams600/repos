import { z } from 'zod'
import { sanitizeText } from '@/lib/security/sanitize'
import { emailSchema } from '@/lib/validation/auth'
import { CONTACT_TOPICS } from '@/lib/validation/contact-topics'

export { CONTACT_TOPICS }

export const contactSchema = z.object({
  name: z
    .string({ error: 'Enter your name' })
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(1, 'Enter your name').max(100, 'Name is too long')),
  email: emailSchema,
  topic: z.enum(CONTACT_TOPICS.map((t) => t.value) as [string, ...string[]], { error: 'Choose a topic' }),
  message: z
    .string({ error: 'Enter a message' })
    .transform((v) => sanitizeText(v, { multiline: true }))
    .pipe(z.string().min(10, 'Tell us a little more (at least 10 characters)').max(4000, 'Keep your message under 4,000 characters')),
})
