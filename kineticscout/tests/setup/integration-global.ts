import { execSync } from 'node:child_process'

/** Applies migrations to the integration database once before the suite runs. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://kinetic:kinetic_dev_only@localhost:5432/kineticscout_test'
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
  })
}
