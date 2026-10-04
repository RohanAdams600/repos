import { adminRouter } from '@/server/routers/admin'
import { analysisRouter } from '@/server/routers/analysis'
import { matchmakerRouter } from '@/server/routers/matchmaker'
import { metricsRouter } from '@/server/routers/metrics'
import { notificationsRouter } from '@/server/routers/notifications'
import { pipelineRouter } from '@/server/routers/pipeline'
import { recruitingRouter } from '@/server/routers/recruiting'
import { verificationRouter } from '@/server/routers/verification'
import { createRouter } from '@/server/trpc'

export const appRouter = createRouter({
  metrics: metricsRouter,
  analysis: analysisRouter,
  matchmaker: matchmakerRouter,
  pipeline: pipelineRouter,
  admin: adminRouter,
  verification: verificationRouter,
  notifications: notificationsRouter,
  recruiting: recruitingRouter,
})

export type AppRouter = typeof appRouter
