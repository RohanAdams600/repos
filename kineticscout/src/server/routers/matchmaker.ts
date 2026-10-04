import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Division } from '@/generated/prisma/enums'
import { cached } from '@/lib/cache'
import { db } from '@/lib/db'
import { rankPrograms, type FitBand, type ProgramInput } from '@/lib/matchmaker/score'
import { bestMetrics } from '@/lib/metrics/service'
import { createRouter, proProcedure } from '@/server/trpc'

const BANDS = ['STRONG', 'REALISTIC', 'REACH', 'LONG_SHOT'] as const satisfies readonly FitBand[]

/** All baseball programs with matchmaking data. Changes rarely; cached for 10 minutes across instances. */
function loadPrograms(): Promise<ProgramInput[]> {
  return cached('matchmaker:programs:baseball:v1', 600, async () => {
    const rows = await db.collegeProgram.findMany({
      where: { sport: 'BASEBALL' },
      select: { id: true, schoolName: true, division: true, state: true, conference: true, minGpa: true, averageRecruitingMetrics: true },
      orderBy: { schoolName: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      schoolName: r.schoolName,
      division: r.division,
      state: r.state,
      conference: r.conference,
      minGpa: r.minGpa === null ? null : Number(r.minGpa),
      metrics: r.averageRecruitingMetrics,
    }))
  })
}

export const matchmakerRouter = createRouter({
  search: proProcedure('matchmaker')
    .input(
      z.object({
        divisions: z.array(z.enum(Division)).max(5).optional(),
        bands: z.array(z.enum(BANDS)).max(4).optional(),
        state: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        page: z.number().int().min(1).max(1000).default(1),
        pageSize: z.number().int().min(5).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await db.athleteProfile.findUniqueOrThrow({
        where: { userId: ctx.user.id },
        select: { primaryPosition: true, gpa: true, gradYear: true },
      })
      const best = await bestMetrics(ctx.user.id)
      const athlete = { position: profile.primaryPosition, gpa: profile.gpa === null ? null : Number(profile.gpa), bestMetrics: best }

      // Repeat queries with the same metrics and filters are served from cache.
      const fingerprint = createHash('sha256').update(JSON.stringify({ athlete, input })).digest('hex').slice(0, 24)
      const ranked = await cached(`matchmaker:result:${ctx.user.id}:${fingerprint}`, 300, async () =>
        rankPrograms(athlete, await loadPrograms(), input),
      )
      const pipeline = await db.recruitingPipeline.findMany({
        where: { athleteId: ctx.user.id, collegeId: { in: ranked.results.map((r) => r.programId) } },
        select: { collegeId: true, status: true },
      })
      return {
        athlete: { position: profile.primaryPosition, gpa: athlete.gpa, gradYear: profile.gradYear, metricsUsed: Object.keys(best) },
        ...ranked,
        pipeline: Object.fromEntries(pipeline.map((p) => [p.collegeId, p.status])),
      }
    }),
})
