import 'server-only'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
  /** Deduplicates retries at the provider (Resend honours Idempotency-Key for 24h). */
  idempotencyKey: string
  /** Marketing messages must carry an unsubscribe URL; transactional messages must not need one. */
  unsubscribeUrl?: string
  /** Where replies should go (e.g. the visitor who used the contact form). */
  replyTo?: string
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 8_000

/**
 * Sends through Resend's HTTP API with a timeout and one retry on network or 5xx failure.
 * Without a provider key (local development only; staging and production require one) the
 * message is logged by subject and suppressed.
 */
export async function sendEmail(message: EmailMessage): Promise<{ id: string | null }> {
  const e = env()
  if (!e.RESEND_API_KEY) {
    logger.warn({ subject: message.subject }, 'email provider not configured; message suppressed')
    return { id: null }
  }

  const headers: Record<string, string> = {}
  if (message.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${message.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const body = JSON.stringify({
    from: e.EMAIL_FROM,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  })

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${e.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (response.ok) {
        const json = (await response.json()) as { id?: string }
        return { id: json.id ?? null }
      }
      if (response.status < 500) {
        throw new EmailDeliveryError(`Email provider rejected the message (${response.status})`)
      }
      logger.warn({ status: response.status, attempt }, 'email provider error')
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error
      logger.warn({ attempt, ...errorFields(error) }, 'email send attempt failed')
    }
  }
  throw new EmailDeliveryError('Email provider unavailable')
}
