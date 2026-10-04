'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { MetricType } from '@/generated/prisma/enums'
import { getSessionUser } from '@/lib/auth/session'
import type { FormState } from '@/lib/forms'
import { rateLimit } from '@/lib/security/rate-limit'
import { archivePlan, createPlanFromAnalysis, togglePractice, TrainingError } from '@/lib/training/service'

async function athlete(next: string) {
  const user = await getSessionUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  if (!user.termsCurrent) redirect(`/terms-update?next=${encodeURIComponent(next)}`)
  return user
}

export async function createPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await athlete('/dashboard/training')
  if (!(await rateLimit('apiWrite', user.id)).success) return { status: 'error', message: 'Too many requests. Try again in a minute.' }
  const analysisId = String(formData.get('analysisId') ?? '')
  const metric = String(formData.get('metricType') ?? '')
  let planId: string
  try {
    if (!/^[0-9a-f-]{36}$/i.test(analysisId)) throw new TrainingError('NOT_FOUND', 'Analysis not found.')
    planId = await createPlanFromAnalysis(user, analysisId, (metric || null) as MetricType | null)
  } catch (error) {
    if (error instanceof TrainingError) return { status: 'error', message: error.message }
    throw error
  }
  redirect(`/dashboard/training/${planId}?notice=created`)
}

export async function togglePracticeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await athlete('/dashboard/training')
  const itemId = String(formData.get('itemId') ?? '')
  const planId = String(formData.get('planId') ?? '')
  try {
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new TrainingError('NOT_FOUND', 'Drill not found.')
    const marked = await togglePractice(user, itemId)
    revalidatePath(`/dashboard/training/${planId}`)
    return { status: 'success', message: marked ? 'Marked as practiced today.' : 'Today’s practice cleared.' }
  } catch (error) {
    if (error instanceof TrainingError) return { status: 'error', message: error.message }
    throw error
  }
}

export async function archivePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await athlete('/dashboard/training')
  const planId = String(formData.get('planId') ?? '')
  try {
    await archivePlan(user, planId)
  } catch (error) {
    if (error instanceof TrainingError) return { status: 'error', message: error.message }
    throw error
  }
  redirect('/dashboard/training?notice=archived')
}
