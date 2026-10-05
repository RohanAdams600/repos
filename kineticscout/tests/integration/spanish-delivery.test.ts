import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendGuardianConsentRequest } from '@/lib/auth/guardian'
import { db } from '@/lib/db'
import { notify } from '@/lib/notifications/service'
import { pushPayload } from '@/lib/push/service'
import { requestToJoin, createTeam, decideTeam, decideJoin } from '@/lib/teams/service'
import { resetDb } from '../helpers/db'
import { adminId, minorAthlete, teamCoachAccount } from '../helpers/people'

const sent: { to: string; subject: string; text: string; html: string }[] = []
vi.mock('@/lib/email/send', async (original) => ({
  ...(await original<typeof import('@/lib/email/send')>()),
  sendEmail: vi.fn(async (email: { to: string; subject: string; text: string; html: string }) => {
    sent.push(email)
  }),
}))

beforeEach(async () => {
  await resetDb()
  sent.length = 0
})

describe('notifications and emails in the recipient’s language', () => {
  it('stores a notification in the language saved on the account', async () => {
    const athlete = await minorAthlete({ consent: 'GRANTED' })
    await db.user.update({ where: { id: athlete.id }, data: { locale: 'es' } })
    await notify({ userId: athlete.id, kind: 'TEAM_UPDATE', title: { en: 'You joined', es: 'Te uniste' }, body: { en: 'Body', es: 'Cuerpo' } })
    const stored = await db.notification.findFirstOrThrow({ where: { userId: athlete.id } })
    expect(stored).toMatchObject({ title: 'Te uniste', body: 'Cuerpo' })
  })

  it('keeps English for accounts that did not choose Spanish, and fixed strings as written', async () => {
    const athlete = await minorAthlete({ consent: 'GRANTED' })
    await notify({ userId: athlete.id, kind: 'TEAM_UPDATE', title: { en: 'You joined', es: 'Te uniste' }, body: 'A note from staff' })
    const stored = await db.notification.findFirstOrThrow({ where: { userId: athlete.id } })
    expect(stored).toMatchObject({ title: 'You joined', body: 'A note from staff' })
  })

  it('writes to a parent or guardian in the language chosen for them at sign-up', async () => {
    const athlete = await minorAthlete({ consent: 'PENDING' })
    await db.guardianConsent.update({ where: { userId: athlete.id }, data: { locale: 'es' } })
    expect(await sendGuardianConsentRequest(athlete.id)).toBe('sent')
    const email = sent.find((e) => e.to === athlete.guardianEmail)!
    expect(email.subject).toMatch(/^Solicitud de consentimiento/)
    expect(email.text).toContain('Revisar y dar el consentimiento: ')
    expect(email.text).toMatch(/consent\/guardian\?token=[^&\s]+&lang=es/)
    expect(email.html).toContain('lang="es"')
  })

  it('sends a team approval request to the guardian in Spanish while the coach is notified in English', async () => {
    const coach = await teamCoachAccount()
    const teamId = await createTeam(coach, { name: 'Lone Star 16U', sport: 'BASEBALL', orgType: 'CLUB', organization: 'Lone Star Baseball', state: 'TX', coachName: 'Pat Doe', coachTitle: 'Head Coach', directoryUrl: 'https://lonestar.example/coaches' })
    await decideTeam(await adminId(), teamId, 'VERIFIED', null)
    const verified = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { joinCode: true } })
    const athlete = await minorAthlete({ consent: 'GRANTED' })
    await db.guardianConsent.update({ where: { userId: athlete.id }, data: { locale: 'es' } })
    await requestToJoin(athlete, verified.joinCode)
    const member = await db.teamMember.findFirstOrThrow({ where: { teamId, athleteId: athlete.id } })
    expect(await decideJoin(coach.id, member.id, true)).toBe('awaiting-guardian')
    const email = sent.find((e) => e.to === athlete.guardianEmail)!
    expect(email.subject).toContain('quiere unirse a Lone Star 16U')
    const coachNote = await db.notification.findFirstOrThrow({ where: { userId: coach.id, title: { contains: 'asked to join' } } })
    expect(coachNote.body).toMatch(/^Class of \d{4}/)
  })

  it('writes push notifications in the recipient’s language, still without details', () => {
    expect(pushPayload('MESSAGE', '/dashboard/messages/x', 'es')).toMatchObject({ title: 'Mensaje nuevo', body: 'Abre KineticScout para leerlo.' })
    expect(pushPayload('MESSAGE', null)).toMatchObject({ title: 'New message' })
  })
})
