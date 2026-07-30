import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

let client: Anthropic | null = null;

/** Lazy — constructing this eagerly would throw at import time for anyone who hasn't run the wizard yet, since ANTHROPIC_API_KEY starts blank in the shipped .env. */
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export interface CompletionRequest {
  model: string;
  system: string;
  maxTokens: number;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface CompletionResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export async function complete(req: CompletionRequest): Promise<CompletionResponse> {
  const response = await getClient().messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

/** Model tiering, same reasoning as agents/src/config/models.ts: cheap workhorse by default, top tier only for the higher-stakes lanes (back-office money/calendar drafts). */
export const MODELS = {
  SONNET: "claude-sonnet-5",
  OPUS: "claude-opus-5",
} as const;
