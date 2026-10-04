import 'server-only'
import OpenAI from 'openai'
import type { z } from 'zod'
import type { AiFeature } from '@/generated/prisma/enums'
import { estimateTokens, releaseAiSpend, reserveAiSpend, settleAiSpend, tokenCostMicros } from '@/lib/ai/budget'
import { env, requireEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

export type JsonGenerationRequest<T> = {
  feature: AiFeature
  userId: string | null
  system: string
  user: string
  /** Name for the structured output schema (a-z, 0-9, _ or -). */
  schemaName: string
  /** JSON Schema in the subset OpenAI Structured Outputs accepts in strict mode. */
  jsonSchema: Record<string, unknown>
  /** Authoritative validation, including limits strict mode cannot express. */
  validator: z.ZodType<T>
  maxOutputTokens: number
  temperature?: number
}

export type JsonGenerationResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number }

export interface LlmClient {
  generateJson<T>(request: JsonGenerationRequest<T>): Promise<JsonGenerationResult<T>>
}

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmOutputError'
  }
}

/**
 * OpenAI Chat Completions with Structured Outputs. Every call reserves budget first, has a hard
 * timeout, is retried by the SDK on transient failures, and is validated with zod on return. A
 * single repair attempt is made when the output parses but fails validation.
 */
export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI
  private readonly model: string

  constructor() {
    const { OPENAI_API_KEY } = requireEnv('OpenAI', ['OPENAI_API_KEY'])
    this.client = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: 60_000, maxRetries: 2 })
    this.model = env().OPENAI_MODEL
  }

  async generateJson<T>(request: JsonGenerationRequest<T>): Promise<JsonGenerationResult<T>> {
    const estimated = tokenCostMicros(estimateTokens(request.system + request.user) * 2, request.maxOutputTokens * 2)
    const reservation = await reserveAiSpend({
      feature: request.feature,
      model: this.model,
      userId: request.userId,
      estimatedCostMicros: estimated,
    })

    let inputTokens = 0
    let outputTokens = 0
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ]
      for (let attempt = 1; attempt <= 2; attempt++) {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages,
          temperature: request.temperature ?? 0.4,
          max_completion_tokens: request.maxOutputTokens,
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schemaName, schema: request.jsonSchema, strict: true },
          },
        })
        inputTokens += completion.usage?.prompt_tokens ?? 0
        outputTokens += completion.usage?.completion_tokens ?? 0

        const choice = completion.choices[0]
        if (choice?.message.refusal) throw new LlmOutputError('Model refused the request')
        if (choice?.finish_reason === 'length') throw new LlmOutputError('Model output was truncated')
        const content = choice?.message.content ?? ''

        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch {
          throw new LlmOutputError('Model returned invalid JSON')
        }
        const validated = request.validator.safeParse(parsed)
        if (validated.success) {
          await settleAiSpend(reservation, { inputTokens, outputTokens, costMicros: tokenCostMicros(inputTokens, outputTokens) })
          return { data: validated.data, model: completion.model, inputTokens, outputTokens }
        }
        if (attempt === 2) throw new LlmOutputError(`Model output failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}`)
        logger.warn({ schema: request.schemaName }, 'LLM output failed validation; requesting a repair')
        messages.push(
          { role: 'assistant', content },
          {
            role: 'user',
            content: `That output broke these rules: ${validated.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')}. Return corrected JSON only.`,
          },
        )
      }
      throw new LlmOutputError('Unreachable')
    } catch (error) {
      if (inputTokens + outputTokens > 0) {
        await settleAiSpend(reservation, { inputTokens, outputTokens, costMicros: tokenCostMicros(inputTokens, outputTokens) })
      } else {
        await releaseAiSpend(reservation)
      }
      throw error
    }
  }
}
