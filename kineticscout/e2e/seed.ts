import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { makeProfileSlug } from '../src/lib/profile/slug'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Seeds the accounts the specs use (emails end in @e2e.example.test and are replaced on every run)
 * and writes signed stub-session cookies to .state.json.
 */

export type E2EState = {
  athlete: { id: string; cookie: string; slug: string }
  /** A second public athlete with no contact history, so the contact-dialog test does not depend on test order. */
  prospect: { id: string; slug: string }
  coach: { id: string; cookie: string }
  admin: { id: string; cookie: string }
  requestId: string
}

const root = path.resolve(HERE, '..')

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  try {
    for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (match && out[match[1]!] === undefined) out[match[1]!] = match[2]!.replace(/^"|"$/g, '')
    }
  } catch {
    // CI provides the environment directly.
  }
  return out
}

function cookieFor(userId: string, pepper: string): string {
  const mac = createHmac('sha256', pepper).update(`e2e-session-v1\u0000${userId}`, 'utf8').digest('base64url')
  return `${userId}.${mac}`
}

export default async function globalSetup(): Promise<void> {
  const env = loadEnv()
  if (!env.DATABASE_URL || !env.HASH_PEPPER) throw new Error('DATABASE_URL and HASH_PEPPER are required for e2e seeding')
  const termsVersion = /CURRENT_TERMS_VERSION = '([^']+)'/.exec(readFileSync(path.join(root, 'src/lib/legal.ts'), 'utf8'))![1]!
  const db = new Client({ connectionString: env.DATABASE_URL })
  await db.connect()
  try {
    await db.query(`DELETE FROM users WHERE email LIKE '%@e2e.example.test'`)
    await db.query(`DELETE FROM college_programs WHERE school_name LIKE 'E2E %'`)

    const [athlete, prospect, coach, admin] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    // Real slug shape (first name, then 8 characters from the slug alphabet) so isProfileSlug accepts it.
    const slug = makeProfileSlug('Avery')
    const prospectSlug = makeProfileSlug('Riley')
    const insertUser = (id: string, email: string, role: string, dob: string, tier = 'FREE') =>
      db.query(`INSERT INTO users (id, email, role, subscription_tier, date_of_birth, terms_version, terms_accepted_at, updated_at) VALUES ($1, $2, $3::"Role", $4::"SubscriptionTier", $5, $6, now(), now())`, [id, email, role, tier, dob, termsVersion])

    await insertUser(athlete, 'athlete@e2e.example.test', 'ATHLETE', '2006-04-02', 'PRO')
    await insertUser(prospect, 'prospect@e2e.example.test', 'ATHLETE', '2006-09-14')
    await insertUser(coach, 'coach@e2e.example.test', 'COACH', '1984-02-11')
    await insertUser(admin, 'admin@e2e.example.test', 'ADMIN', '1980-01-01')
    await db.query(
      `INSERT INTO athlete_profiles (user_id, first_name, last_name, grad_year, primary_position, height, weight, high_school, is_public, public_slug, public_show_school, public_since, updated_at)
       VALUES ($1, 'Avery', 'Testcase', 2026, 'SHORTSTOP', 72, 180, 'E2E High School', true, $2, true, now(), now())`,
      [athlete, slug],
    )
    await db.query(
      `INSERT INTO athlete_profiles (user_id, first_name, last_name, grad_year, primary_position, height, weight, high_school, is_public, public_slug, public_show_school, public_since, updated_at)
       VALUES ($1, 'Riley', 'Samplecase', 2026, 'CATCHER', 70, 175, 'E2E High School', true, $2, true, now(), now())`,
      [prospect, prospectSlug],
    )
    await db.query(
      `INSERT INTO metrics (id, athlete_id, date, metric_type, value, verified) VALUES
       ($1, $3, current_date - 20, 'EXIT_VELOCITY', 92.5, true),
       ($2, $3, current_date - 30, '60_YARD_DASH', 6.85, false)`,
      [randomUUID(), randomUUID(), athlete],
    )
    const college = randomUUID()
    await db.query(`INSERT INTO college_programs (id, school_name, division, average_recruiting_metrics, updated_at) VALUES ($1, 'E2E State University', 'D1', '{}', now())`, [college])
    await db.query(
      `INSERT INTO coach_profiles (user_id, first_name, last_name, title, college_id, work_email, work_email_verified_at, staff_directory_url, status, reviewed_at, updated_at)
       VALUES ($1, 'Casey', 'Coachman', 'Assistant Coach', $2, 'ccoachman@e2e-state.edu', now(), 'https://e2e-state.edu/staff', 'VERIFIED', now(), now())`,
      [coach, college],
    )
    const requestId = randomUUID()
    await db.query(
      `INSERT INTO contact_requests (id, coach_id, athlete_id, message, guardian_required, expires_at) VALUES ($1, $2, $3, $4, false, now() + interval '30 days')`,
      [requestId, coach, athlete, 'Hi Avery, I watched your season numbers and would like to talk about our program and your plans.'],
    )
    const state: E2EState = {
      athlete: { id: athlete, cookie: cookieFor(athlete, env.HASH_PEPPER), slug },
      prospect: { id: prospect, slug: prospectSlug },
      coach: { id: coach, cookie: cookieFor(coach, env.HASH_PEPPER) },
      admin: { id: admin, cookie: cookieFor(admin, env.HASH_PEPPER) },
      requestId,
    }
    writeFileSync(path.join(HERE, '.state.json'), JSON.stringify(state, null, 2))
  } finally {
    await db.end()
  }
}
