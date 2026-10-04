import { z } from 'zod'
import team from '../../../content/team.json'

/**
 * Team members shown on /about. Real people only, with photos the business owns or is licensed to
 * use (place them in public/team/). An empty list hides the section rather than showing stand-ins.
 */
const memberSchema = z.object({
  name: z.string().min(2).max(80),
  role: z.string().min(2).max(80),
  bio: z.string().min(10).max(400),
  photo: z.string().regex(/^\/team\/[a-z0-9-]+\.(webp|jpg|png)$/).optional(),
  photoAlt: z.string().min(5).max(160).optional(),
}).refine((m) => !m.photo || m.photoAlt, { message: 'Every photo needs alt text', path: ['photoAlt'] })

export type TeamMember = z.infer<typeof memberSchema>

export const TEAM: TeamMember[] = z.array(memberSchema).parse(team)
