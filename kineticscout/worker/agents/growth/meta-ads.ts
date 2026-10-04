import { createHmac } from 'node:crypto'
import { errorFields, logger } from '@/lib/logger'

/**
 * Minimal Meta Marketing API client. Creates an ad creative and an ad inside an existing ad set.
 *
 * Guard rails, all enforced before anything is created:
 *   - the ad account must have an account spending limit, with enough headroom left;
 *   - the target ad set's audience must exclude minors (age_min >= 18);
 *   - ads are created PAUSED unless META_ADS_AUTO_ACTIVATE is explicitly true.
 * Budgets, schedules and audiences are never created or changed by the agent.
 */

export type MetaConfig = {
  accessToken: string
  appSecret?: string
  adAccountId: string
  pageId: string
  adSetId: string
  graphVersion: string
  autoActivate: boolean
  minRemainingCapUsd: number
}

export class MetaGuardrailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetaGuardrailError'
  }
}

export class MetaAdsClient {
  constructor(private readonly config: MetaConfig) {}

  private async call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/${path}`)
    const body = new URLSearchParams({ ...params, access_token: this.config.accessToken })
    if (this.config.appSecret) {
      body.set('appsecret_proof', createHmac('sha256', this.config.appSecret).update(this.config.accessToken).digest('hex'))
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(method === 'GET' ? `${url}?${body}` : url, {
        method,
        ...(method === 'POST' ? { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}),
        signal: AbortSignal.timeout(15_000),
      })
      const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; is_transient?: boolean } }
      if (response.ok && !json.error) return json
      const transient = response.status >= 500 || json.error?.is_transient === true
      if (!transient || attempt === 3) {
        throw new Error(`Meta API ${method} ${path} failed (${response.status}): ${json.error?.message ?? 'unknown error'}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt))
    }
    throw new Error('unreachable')
  }

  /** Throws MetaGuardrailError unless the account has a spending limit with headroom and the ad set targets adults only. */
  async assertGuardrails(): Promise<void> {
    const account = await this.call<{ spend_cap?: string; amount_spent?: string; currency?: string }>('GET', `act_${this.config.adAccountId}`, {
      fields: 'spend_cap,amount_spent,currency',
    })
    const capCents = Number(account.spend_cap ?? 0)
    if (!capCents) throw new MetaGuardrailError('Ad account has no spending limit. Set an account spending limit in Ads Manager first.')
    const remainingUsd = (capCents - Number(account.amount_spent ?? 0)) / 100
    if (remainingUsd < this.config.minRemainingCapUsd) {
      throw new MetaGuardrailError(`Only ${remainingUsd.toFixed(2)} ${account.currency ?? ''} left under the account spending limit.`)
    }

    const adSet = await this.call<{ targeting?: { age_min?: number } }>('GET', this.config.adSetId, { fields: 'targeting' })
    if ((adSet.targeting?.age_min ?? 0) < 18) {
      throw new MetaGuardrailError('Ad set audience must be 18 or older. Minors are never targeted with paid ads.')
    }
  }

  async createAd(input: {
    name: string
    primaryText: string
    headline: string
    description: string
    callToAction: string
    link: string
  }): Promise<{ adId: string; creativeId: string; status: 'ACTIVE' | 'PAUSED' }> {
    await this.assertGuardrails()
    const creative = await this.call<{ id: string }>('POST', `act_${this.config.adAccountId}/adcreatives`, {
      name: `${input.name} creative`,
      object_story_spec: JSON.stringify({
        page_id: this.config.pageId,
        link_data: {
          link: input.link,
          message: input.primaryText,
          name: input.headline,
          description: input.description,
          call_to_action: { type: input.callToAction, value: { link: input.link } },
        },
      }),
    })
    const status = this.config.autoActivate ? 'ACTIVE' : 'PAUSED'
    const ad = await this.call<{ id: string }>('POST', `act_${this.config.adAccountId}/ads`, {
      name: input.name,
      adset_id: this.config.adSetId,
      creative: JSON.stringify({ creative_id: creative.id }),
      status,
    })
    logger.info({ adId: ad.id, status }, 'meta ad created')
    return { adId: ad.id, creativeId: creative.id, status }
  }
}

export function safeMetaError(error: unknown): string {
  logger.warn(errorFields(error), 'meta publish failed')
  return error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'
}
