import { z } from 'zod'
import { emailSchema } from '@/lib/validation/auth'

export const guardianLinkRequestSchema = z.object({ email: emailSchema })
