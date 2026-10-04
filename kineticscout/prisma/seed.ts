/**
 * Development fixtures. Refuses to run anywhere except DEPLOY_ENV=local.
 *
 * Programs are deliberately fictional ("Fixture ..." names, no data source) so they can never be
 * mistaken for real schools or real recruiting data. Real program data must be loaded from a
 * documented source with dataSourceUrl and dataVerifiedAt set.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

if ((process.env.DEPLOY_ENV ?? 'local') !== 'local') {
  console.error('Refusing to seed: fixtures are for local development only.')
  process.exit(1)
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const DIVISIONS = [
  { division: 'D1', exit: 93, sixty: 6.75, infield: 87, outfield: 90, pop: 1.95, pitch: 89, gpa: 2.3 },
  { division: 'D2', exit: 89, sixty: 6.95, infield: 83, outfield: 86, pop: 2.02, pitch: 85, gpa: 2.2 },
  { division: 'D3', exit: 86, sixty: 7.1, infield: 80, outfield: 83, pop: 2.08, pitch: 82, gpa: 2.5 },
  { division: 'NAIA', exit: 87, sixty: 7.05, infield: 81, outfield: 84, pop: 2.06, pitch: 83, gpa: 2.0 },
  { division: 'JUCO', exit: 88, sixty: 7.0, infield: 82, outfield: 85, pop: 2.04, pitch: 84, gpa: null },
] as const

const STATES = ['TX', 'FL', 'CA', 'GA', 'AZ', 'NC', 'OH', 'IL']

async function main() {
  let created = 0
  for (const d of DIVISIONS) {
    for (let i = 0; i < 12; i++) {
      const shift = (i - 6) * 0.35
      await db.collegeProgram.upsert({
        where: { schoolName_sport: { schoolName: `Fixture ${d.division} Program ${String(i + 1).padStart(2, '0')}`, sport: 'BASEBALL' } },
        update: {},
        create: {
          schoolName: `Fixture ${d.division} Program ${String(i + 1).padStart(2, '0')}`,
          sport: 'BASEBALL',
          division: d.division,
          state: STATES[i % STATES.length],
          conference: 'Development Fixture Conference',
          minGpa: d.gpa,
          averageRecruitingMetrics: {
            EXIT_VELOCITY: { mean: Number((d.exit + shift).toFixed(1)), sd: 4 },
            SIXTY_YARD_DASH: { mean: Number((d.sixty - shift * 0.02).toFixed(2)), sd: 0.2 },
            INFIELD_VELO: { mean: Number((d.infield + shift).toFixed(1)), sd: 4 },
            OUTFIELD_VELO: { mean: Number((d.outfield + shift).toFixed(1)), sd: 4 },
            POP_TIME: { mean: Number((d.pop - shift * 0.01).toFixed(2)), sd: 0.08 },
            PITCH_VELO: { mean: Number((d.pitch + shift).toFixed(1)), sd: 3 },
          },
        },
      })
      created++
    }
  }
  console.log(`Seeded ${created} fictional college programs for local development.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
