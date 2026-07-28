import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
  const response = await anthropic.messages.create({
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
