/**
 * Grants or revokes the ADMIN role. There is deliberately no UI or API for this: it requires direct
 * database access, and every change is written to the audit log.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const [email, flag] = process.argv.slice(2)
if (!email || !email.includes('@')) {
  console.error('Usage: npm run admin:grant -- <email> [--revoke]')
  process.exit(1)
}
const revoke = flag === '--revoke'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const user = await db.user.findUnique({ where: { email: email!.toLowerCase() }, select: { id: true, role: true, dateOfBirth: true } })
  if (!user) throw new Error('No user with that email. They must sign up first.')
  const age = (Date.now() - user.dateOfBirth.getTime()) / (365.25 * 24 * 3600_000)
  if (!revoke && age < 18) throw new Error('Admins must be adults.')
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { role: revoke ? 'ATHLETE' : 'ADMIN' } }),
    db.auditLog.create({
      data: { action: revoke ? 'admin.role_revoked' : 'admin.role_granted', targetType: 'user', targetId: user.id, metadata: { via: 'cli', previousRole: user.role } },
    }),
  ])
  console.log(`${revoke ? 'Revoked' : 'Granted'} ADMIN for user ${user.id}.`)
}

main()
  .catch((error) => {
    console.error((error as Error).message)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
