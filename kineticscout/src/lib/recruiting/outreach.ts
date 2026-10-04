import 'server-only'
import { z } from 'zod'
import type { OutreachChannel, OutreachTrigger } from '@/generated/prisma/enums'
import type { LlmClient } from '@/lib/ai/llm'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { buildProfileCard } from '@/lib/profile/public'
import { formatHeight } from '@/lib/profile/format'
import { checkDraft, DRAFT_LIMITS, draftJsonSchema, type OutreachFacts } from '@/lib/recruiting/draft-check'

/**
 * AI Outreach Assistant. Drafts are written only from a fixed fact sheet (the athlete's own
 * profile and numbers, and sourced program facts). The athlete reviews, edits and sends them from
 * their own email or social account; KineticScout never sends outreach on anyone's behalf.
 */

export async function buildOutreachFacts(athleteId: string, collegeId: string, changeId: string | null): Promise<OutreachFacts> {
  const [card, program, change] = await Promise.all([
    buildProfileCard(athleteId, 'owner'),
    db.collegeProgram.findUniqueOrThrow({
      where: { id: collegeId },
      select: { schoolName: true, division: true, conference: true, headCoachName: true, headCoachBackground: true, recentSeasonSummary: true },
    }),
    changeId ? db.programChange.findUnique({ where: { id: changeId }, select: { kind: true, newValue: true } }) : null,
  ])
  if (!card) throw new Error('athlete profile not found')
  const newValue = (change?.newValue ?? {}) as { name?: string; note?: string }
  return {
    athlete: {
      name: `${card.firstName} ${card.lastName}`,
      gradYear: card.gradYear,
      position: card.positionLabel,
      height: card.heightInches ? formatHeight(card.heightInches) : null,
      weightLbs: card.weightLbs,
      gpa: card.gpa,
      highSchool: card.highSchool,
      measurements: card.metrics.slice(0, 6).map((m) => ({
        label: m.label,
        value: `${m.best.toFixed(m.decimals)} ${m.unit}`,
        measuredOn: m.bestDate,
        verified: m.bestVerified,
      })),
      profileUrl: card.isPublic && card.slug ? `${env().APP_URL}/p/${card.slug}` : null,
    },
    program: {
      school: program.schoolName,
      division: program.division,
      conference: program.conference,
      headCoachName: program.headCoachName,
      headCoachBackground: program.headCoachBackground,
      recentSeason: program.recentSeasonSummary,
    },
    occasion:
      change?.kind === 'HEAD_COACH_CHANGED' && newValue.name
        ? { kind: 'COACH_CHANGE', newCoach: newValue.name }
        : change?.kind === 'ROSTER_NEED_POSTED' && newValue.note
          ? { kind: 'ROSTER_NEED', need: newValue.note }
          : { kind: 'MANUAL' },
  }
}

const SYSTEM = `You write first-contact messages from a high school athlete to a college coach.
Rules:
- Write as the athlete, in the first person, plain and respectful. No hype, no slang, no emoji, no em dashes.
- Use ONLY facts from the JSON fact sheet. Never invent statistics, rankings, awards, coach history, team results or personal details.
- Every number you write must appear in the fact sheet exactly. Mention that a measurement is verified only if "verified" is true.
- If headCoachName is present, address that coach by name. Mention the coach's background only using headCoachBackground, briefly and factually.
- If recentSeason is present you may reference it in one short clause. If it is absent, do not mention results.
- For occasion COACH_CHANGE: congratulate the new coach on the position and introduce yourself. For ROSTER_NEED: refer to the posted need factually.
- Never promise anything or ask for an offer. Ask whether the athlete could be considered and how best to share more information.
- If profileUrl is present, include it once. End with the athlete's name and class.
- EMAIL: subject under 100 characters, body under 1,600 characters. DM: subject must be an empty string, body under 500 characters.`

export async function draftOutreach(
  llm: LlmClient,
  input: { athleteId: string; collegeId: string; changeId: string | null; channel: OutreachChannel; trigger: OutreachTrigger },
): Promise<{ id: string; subject: string | null; body: string }> {
  const facts = await buildOutreachFacts(input.athleteId, input.collegeId, input.changeId)
  const limits = DRAFT_LIMITS[input.channel]
  const validator = z
    .object({ subject: z.string().max(Math.max(limits.subject, 1)), body: z.string().min(80).max(limits.body) })
    .superRefine((draft, ctx) => {
      for (const problem of checkDraft(draft, facts, input.channel)) ctx.addIssue({ code: 'custom', message: problem })
    })
  const result = await llm.generateJson({
    feature: 'OUTREACH_DRAFT',
    userId: input.athleteId,
    system: SYSTEM,
    user: `Channel: ${input.channel}\nFact sheet:\n${JSON.stringify(facts, null, 2)}`,
    schemaName: 'outreach_draft',
    jsonSchema: draftJsonSchema,
    validator,
    maxOutputTokens: input.channel === 'EMAIL' ? 700 : 300,
    temperature: 0.5,
  })
  const subject = input.channel === 'EMAIL' ? result.data.subject.trim() : null
  const draft = await db.outreachDraft.create({
    data: {
      athleteId: input.athleteId,
      collegeId: input.collegeId,
      changeId: input.changeId,
      trigger: input.trigger,
      channel: input.channel,
      subject,
      body: result.data.body.trim(),
      facts: facts as unknown as object,
      model: result.model,
    },
    select: { id: true, subject: true, body: true },
  })
  await audit('outreach.drafted', { actorId: input.trigger === 'MANUAL' ? input.athleteId : null, targetType: 'outreach_draft', targetId: draft.id, metadata: { trigger: input.trigger, channel: input.channel } })
  return draft
}
