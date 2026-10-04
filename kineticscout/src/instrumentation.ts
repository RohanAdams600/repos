/**
 * Runs once when a server instance starts. Validates the environment so a misconfigured deploy
 * fails immediately at boot (and in the platform's health checks) instead of on a user request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { env } = await import('@/lib/env')
  env()
}
