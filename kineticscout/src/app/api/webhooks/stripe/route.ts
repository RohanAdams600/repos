import type Stripe from 'stripe'
import { stripe } from '@/lib/billing/stripe'
import { processStripeEvent } from '@/lib/billing/webhook'
import { requireEnv } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Stripe event payloads are small; anything larger is not a genuine webhook.
const MAX_BODY_BYTES = 512 * 1024

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 })

  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_BODY_BYTES) return Response.json({ error: 'Payload too large' }, { status: 413 })

  // The raw body is required for signature verification; never parse it before verifying.
  const payload = await request.text()
  if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) return Response.json({ error: 'Payload too large' }, { status: 413 })

  let event: Stripe.Event
  try {
    const { STRIPE_WEBHOOK_SECRET } = requireEnv('Stripe webhooks', ['STRIPE_WEBHOOK_SECRET'])
    // Verifies the HMAC signature and rejects timestamps outside the default 5-minute tolerance (replay protection).
    event = stripe().webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET)
  } catch {
    logger.warn('stripe webhook signature verification failed')
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const outcome = await processStripeEvent(event)
    logger.info({ eventId: event.id, type: event.type, outcome }, 'stripe webhook handled')
    return Response.json({ received: true })
  } catch (error) {
    logger.error({ eventId: event.id, type: event.type, ...errorFields(error) }, 'stripe webhook processing failed')
    // Non-2xx makes Stripe retry with exponential backoff.
    return Response.json({ error: 'Processing failed' }, { status: 500 })
  }
}
