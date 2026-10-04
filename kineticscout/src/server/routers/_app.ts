import { adminRouter } from '@/server/routers/admin'
import { analysisRouter } from '@/server/routers/analysis'
import { matchmakerRouter } from '@/server/routers/matchmaker'
import { metricsRouter } from '@/server/routers/metrics'
import { pipelineRouter } from '@/server/routers/pipeline'
import { createRouter } from '@/server/trpc'

export const appRouter = createRouter({
  metrics: metricsRouter,
  analysis: analysisRouter,
  matchmaker: matchmakerRouter,
  pipeline: pipelineRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
