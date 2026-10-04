'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/auth/permissions'
import { getSessionUser } from '@/lib/auth/session'
import { eventInputSchema, utcDay } from '@/lib/events/rules'
import { canSubmitEvent, EventError, setAttendance, submitEvent, updateEvent } from '@/lib/events/service'
import { fieldErrorsFrom, formValues, type FormState } from '@/lib/forms'
import { rateLimit } from '@/lib/security/rate-limit'

export async function submitEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser()
  if (!user) redirect('/sign-in?next=/events/submit')
  if (!user.termsCurrent) redirect('/terms-update?next=/events/submit')
  const values = formValues(formData)
  if (!canSubmitEvent(user)) return { status: 'error', message: 'Event listings are submitted by coaches and parents.', values }
  const editingId = String(formData.get('eventId') ?? '')
  if (editingId && !isAdmin(user)) return { status: 'error', message: 'Only staff can edit a listed event.', values }
  if (!editingId && !isAdmin(user) && !(await rateLimit('eventSubmit', user.id)).success) return { status: 'error', message: 'You have submitted several events today. Try again tomorrow.', values }

  const parsed = eventInputSchema(utcDay(new Date())).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  let id = editingId
  try {
    if (editingId) await updateEvent(user.id, editingId, parsed.data)
    else id = (await submitEvent(user, parsed.data)).id
  } catch (error) {
    if (error instanceof EventError) return { status: 'error', message: error.message, values }
    throw error
  }
  revalidatePath('/events')
  redirect(`/events/${id}?notice=${editingId ? 'updated' : 'submitted'}`)
}

export async function attendanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser()
  const eventId = String(formData.get('eventId') ?? '')
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${eventId}`)}`)
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { status: 'error', message: 'Event not found.' }
  if (!(await rateLimit('eventAttendance', user.id)).success) return { status: 'error', message: 'Too many changes. Try again in a few minutes.' }
  const going = formData.get('going') === 'yes'
  try {
    await setAttendance(user, eventId, { going, shareWithCoaches: going && formData.get('shareWithCoaches') === 'on' })
  } catch (error) {
    if (error instanceof EventError) return { status: 'error', message: error.message }
    throw error
  }
  revalidatePath(`/events/${eventId}`)
  return { status: 'success', message: going ? 'Saved. This event is on your Events page.' : 'Removed from your events.' }
}
