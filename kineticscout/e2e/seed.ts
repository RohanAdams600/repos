import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
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
  /** A second college coach whose request Avery already accepted, with a conversation open. */
  recruiter: { id: string; cookie: string; threadId: string }
  teamCoach: { id: string; cookie: string; teamId: string; sessionId: string }
  admin: { id: string; cookie: string }
  requestId: string
  /** Guardian links for a minor: a team approval and a copied conversation. */
  guardian: { teamToken: string; threadId: string; threadToken: string }
  /** Parent account for Jamie (consent given) and Sam (consent not yet given). */
  parent: { id: string; cookie: string; jamieId: string; samId: string }
  /** A listed event Avery is going to (shared with coaches), another listed one, and one waiting for review. */
  events: { going: string; open: string; pending: string }
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
    await db.query(`DELETE FROM norm_datasets WHERE publisher LIKE 'E2E %'`)
    await db.query(`DELETE FROM events WHERE name LIKE 'E2E %'`)
    await db.query(`DELETE FROM recruiting_periods WHERE source_title LIKE 'E2E %'`)
    await db.query(`DELETE FROM drills WHERE author LIKE 'E2E %'`)

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
    // Second college coach with an accepted request and an open conversation.
    const recruiter = randomUUID()
    await insertUser(recruiter, 'recruiter@e2e.example.test', 'COACH', '1979-08-21')
    await db.query(
      `INSERT INTO coach_profiles (user_id, first_name, last_name, title, college_id, work_email, work_email_verified_at, staff_directory_url, status, reviewed_at, updated_at)
       VALUES ($1, 'Morgan', 'Recruiter', 'Recruiting Coordinator', $2, 'mrecruiter@e2e-state.edu', now(), 'https://e2e-state.edu/staff', 'VERIFIED', now(), now())`,
      [recruiter, college],
    )
    const acceptedId = randomUUID()
    await db.query(
      `INSERT INTO contact_requests (id, coach_id, athlete_id, message, status, guardian_required, athlete_responded_at, shared_emails, expires_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', false, now(), ARRAY['athlete@e2e.example.test'], now() + interval '30 days')`,
      [acceptedId, recruiter, athlete, 'Hi Avery, our staff would like to learn more about your season and your plans after graduation.'],
    )
    const threadId = randomUUID()
    await db.query(`INSERT INTO message_threads (id, contact_request_id, coach_id, athlete_id, guardian_copy) VALUES ($1, $2, $3, $4, false)`, [threadId, acceptedId, recruiter, athlete])
    await db.query(`INSERT INTO messages (id, thread_id, sender_id, body) VALUES ($1, $2, $3, $4)`, [randomUUID(), threadId, recruiter, 'Thanks for accepting. When is a good time for a call this week?'])

    // Verified high school team with Avery on the roster and one result waiting for Avery.
    const teamCoach = randomUUID()
    await insertUser(teamCoach, 'teamcoach@e2e.example.test', 'TEAM_COACH', '1982-03-14')
    const teamId = randomUUID()
    await db.query(
      `INSERT INTO teams (id, coach_id, name, sport, org_type, organization, state, coach_name, coach_title, directory_url, status, reviewed_at, join_code, updated_at)
       VALUES ($1, $2, 'E2E High School Varsity Baseball', 'BASEBALL', 'HIGH_SCHOOL', 'E2E High School', 'TX', 'Pat Teamcoach', 'Head Coach', 'https://e2e-high.example.org/athletics/staff', 'VERIFIED', now(), $3, now())`,
      [teamId, teamCoach, Array.from(randomBytes(10), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')],
    )
    await db.query(`INSERT INTO team_members (id, team_id, athlete_id, status, guardian_required, coach_decided_at) VALUES ($1, $2, $3, 'ACTIVE', false, now())`, [randomUUID(), teamId, athlete])
    const sessionId = randomUUID()
    await db.query(`INSERT INTO testing_sessions (id, team_id, date, label, location) VALUES ($1, $2, current_date - 2, 'Fall testing', 'E2E High School field')`, [sessionId, teamId])
    await db.query(`INSERT INTO team_entries (id, session_id, team_id, athlete_id, metric_type, value) VALUES ($1, $2, $3, $4, 'EXIT_VELOCITY', 93.0)`, [randomUUID(), sessionId, teamId, athlete])

    // A minor with a team approval and a copied conversation waiting on their guardian.
    const minor = randomUUID()
    const minorDob = `${new Date().getUTCFullYear() - 16}-01-15`
    await insertUser(minor, 'minor@e2e.example.test', 'ATHLETE', minorDob)
    await db.query(
      `INSERT INTO athlete_profiles (user_id, first_name, last_name, grad_year, primary_position, height, weight, is_public, public_slug, public_since, updated_at)
       VALUES ($1, 'Jamie', 'Juniorcase', 2028, 'OUTFIELD', 69, 160, true, $2, now(), now())`,
      [minor, makeProfileSlug('Jamie')],
    )
    await db.query(
      `INSERT INTO guardian_consents (id, user_id, guardian_email, token_hash, status, expires_at, granted_at, updated_at) VALUES ($1, $2, 'parent@e2e.example.test', $3, 'GRANTED', now() + interval '1 day', now(), now())`,
      [randomUUID(), minor, createHash('sha256').update(randomUUID()).digest('hex')],
    )
    const teamToken = randomBytes(32).toString('base64url')
    await db.query(
      `INSERT INTO team_members (id, team_id, athlete_id, status, guardian_required, coach_decided_at, guardian_token_hash, guardian_token_expires_at)
       VALUES ($1, $2, $3, 'AWAITING_GUARDIAN', true, now(), $4, now() + interval '14 days')`,
      [randomUUID(), teamId, minor, createHash('sha256').update(teamToken).digest('hex')],
    )
    const minorRequest = randomUUID()
    await db.query(
      `INSERT INTO contact_requests (id, coach_id, athlete_id, message, status, guardian_required, athlete_responded_at, guardian_responded_at, shared_emails, expires_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', true, now(), now(), ARRAY['minor@e2e.example.test', 'parent@e2e.example.test'], now() + interval '30 days')`,
      [minorRequest, recruiter, minor, 'Hi Jamie, I would like to talk with you and your parents about our summer camp schedule.'],
    )
    const minorThread = randomUUID()
    await db.query(`INSERT INTO message_threads (id, contact_request_id, coach_id, athlete_id, guardian_copy) VALUES ($1, $2, $3, $4, true)`, [minorThread, minorRequest, recruiter, minor])
    await db.query(`INSERT INTO messages (id, thread_id, sender_id, body) VALUES ($1, $2, $3, $4)`, [randomUUID(), minorThread, recruiter, 'Could we set up a call with you and a parent next week?'])

    // Parent account under Jamie's guardian address, plus a second child waiting for consent.
    const parent = randomUUID()
    await insertUser(parent, 'parent@e2e.example.test', 'GUARDIAN', '1979-06-20')
    const sam = randomUUID()
    await insertUser(sam, 'sam@e2e.example.test', 'ATHLETE', `${new Date().getUTCFullYear() - 14}-03-02`)
    await db.query(`INSERT INTO athlete_profiles (user_id, first_name, last_name, grad_year, primary_position, updated_at) VALUES ($1, 'Sam', 'Juniorcase', 2030, 'CATCHER', now())`, [sam])
    await db.query(
      `INSERT INTO guardian_consents (id, user_id, guardian_email, token_hash, status, expires_at, updated_at) VALUES ($1, $2, 'parent@e2e.example.test', $3, 'PENDING', now() + interval '7 days', now())`,
      [randomUUID(), sam, createHash('sha256').update(randomUUID()).digest('hex')],
    )

    // Events: clearly labelled fixtures. Avery is going to one and shares it with coaches.
    const [goingEvent, openEvent, pendingEvent] = [randomUUID(), randomUUID(), randomUUID()]
    const insertEvent = (id: string, name: string, status: string, days: number) =>
      db.query(
        `INSERT INTO events (id, name, kind, sport, organizer, official_url, start_date, end_date, city, state, description, status, submitted_by, reviewed_by, reviewed_at, updated_at)
         VALUES ($1, $2, 'SHOWCASE', 'BASEBALL', 'E2E Fixture Events (test data)', 'https://e2e.example.test/events', current_date + $3::int, current_date + $3::int + 1, 'Austin', 'TX',
                 'Fixture event used only by automated tests. Not a real event.', $4::"EventStatus", $5, $6, $7, now())`,
        [id, name, days, status, parent, status === 'PENDING' ? null : admin, status === 'PENDING' ? null : new Date()],
      )
    await insertEvent(goingEvent, 'E2E Fall Showcase', 'PUBLISHED', 20)
    await insertEvent(openEvent, 'E2E Winter Camp', 'PUBLISHED', 40)
    await insertEvent(pendingEvent, 'E2E Spring Combine', 'PENDING', 60)
    await db.query(`INSERT INTO event_attendance (event_id, athlete_id, share_with_coaches, updated_at) VALUES ($1, $2, true, now())`, [goingEvent, athlete])
    await db.query(
      `INSERT INTO recruiting_periods (id, sport, division, kind, start_date, end_date, source_url, source_title, note, created_by)
       VALUES ($1, 'BASEBALL', 'D1', 'CONTACT', current_date - 5, current_date + 5, 'https://e2e.example.test/calendar', 'E2E fixture calendar (not a real calendar)', 'Test data only.', $2)`,
      [randomUUID(), admin],
    )

    // Training: two published fixture drills and a completed swing analysis for Avery.
    const insertDrill = (title: string, focus: string) =>
      db.query(
        `INSERT INTO drills (id, title, sport, motion_types, focus_codes, summary, steps, minutes, safety_note, source, author, status, reviewed_by, published_at, updated_at)
         VALUES ($1, $2, 'BASEBALL', ARRAY['SWING']::"MotionType"[], ARRAY[$3], 'Fixture drill used only by automated tests.', ARRAY['Fixture step one.', 'Fixture step two.'], 10,
                 'Fixture safety note.', 'STAFF', 'E2E fixture coach (test data)', 'PUBLISHED', $4, now(), now())`,
        [randomUUID(), title, focus, admin],
      )
    await insertDrill('E2E hip lead drill', 'TRUNK_LEADS_PELVIS')
    await insertDrill('E2E separation drill', 'LOW_HIP_SHOULDER_SEPARATION')
    const report = {
      algorithm: 'kseq-2d-v1',
      motionType: 'SWING',
      handedness: 'RIGHT',
      frameRate: 120,
      durationSec: 1.2,
      footStrikeTime: 0.42,
      peaks: [
        { segment: 'torso', time: 0.55, speedDegPerSec: 620 },
        { segment: 'pelvis', time: 0.58, speedDegPerSec: 540 },
        { segment: 'arm', time: 0.63, speedDegPerSec: 980 },
        { segment: 'hand', time: 0.66, speedDegPerSec: 1450 },
      ],
      observedOrder: ['torso', 'pelvis', 'arm', 'hand'],
      sequenceIsIdeal: false,
      gapsMs: { pelvisToTorso: -30, torsoToArm: 80, armToHand: 30 },
      separationAtFootStrikeDeg: 12,
      maxSeparationDeg: 18,
      findings: [
        { code: 'TRUNK_LEADS_PELVIS', severity: 'high', title: 'Shoulders turn before the hips', detail: 'Fixture finding.', focus: 'Let the hips start the turn.' },
        { code: 'LOW_HIP_SHOULDER_SEPARATION', severity: 'medium', title: 'Little hip and shoulder separation', detail: 'Fixture finding.', focus: 'Create stretch between hips and shoulders.' },
      ],
      warnings: [],
      confidence: 0.9,
    }
    await db.query(
      `INSERT INTO video_analyses (id, athlete_id, motion_type, handedness, status, object_key, content_type, size_bytes, report, algorithm, completed_at)
       VALUES ($1, $2, 'SWING', 'RIGHT', 'COMPLETE', $3, 'video/mp4', 1000, $4, 'kseq-2d-v1', now())`,
      [randomUUID(), athlete, `e2e/${randomUUID()}.mp4`, JSON.stringify(report)],
    )

    // Fixture norm table covering Avery's age and build. Clearly labelled as test data.
    const normId = randomUUID()
    await db.query(
      `INSERT INTO norm_datasets (id, name, publisher, edition, population, source_url, licence, status, row_count, activated_at, updated_at)
       VALUES ($1, 'End-to-end fixture table', 'E2E Fixture Norms (not real data)', '2026', 'Synthetic values used only by automated tests.', 'https://e2e.example.test/norms', 'Test fixture, never shown in production.', 'ACTIVE', 1, now(), now())`,
      [normId],
    )
    await db.query(
      `INSERT INTO norm_rows (id, dataset_id, metric_type, age_min, age_max, height_min, height_max, sample_size, p10, p25, p50, p75, p90)
       VALUES ($1, $2, 'EXIT_VELOCITY', 18, 22, 70, 74, 500, 78, 83, 88, 92, 96)`,
      [randomUUID(), normId],
    )

    const state: E2EState = {
      athlete: { id: athlete, cookie: cookieFor(athlete, env.HASH_PEPPER), slug },
      prospect: { id: prospect, slug: prospectSlug },
      coach: { id: coach, cookie: cookieFor(coach, env.HASH_PEPPER) },
      recruiter: { id: recruiter, cookie: cookieFor(recruiter, env.HASH_PEPPER), threadId },
      teamCoach: { id: teamCoach, cookie: cookieFor(teamCoach, env.HASH_PEPPER), teamId, sessionId },
      admin: { id: admin, cookie: cookieFor(admin, env.HASH_PEPPER) },
      requestId,
      guardian: { teamToken, threadId: minorThread, threadToken: createHmac('sha256', env.HASH_PEPPER).update(`thread-guardian-v1\u0000${minorThread}`, 'utf8').digest('base64url') },
      parent: { id: parent, cookie: cookieFor(parent, env.HASH_PEPPER), jamieId: minor, samId: sam },
      events: { going: goingEvent, open: openEvent, pending: pendingEvent },
    }
    writeFileSync(path.join(HERE, '.state.json'), JSON.stringify(state, null, 2))
  } finally {
    await db.end()
  }
}
