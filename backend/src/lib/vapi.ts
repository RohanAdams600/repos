/**
 * Vapi (voice AI) integration. Two hard rules enforced here, not just in
 * docs, per the founder's explicit instruction: this code may only ever
 * touch the "Autonoma Cold Call" and "Autonoma Website Demo" assistants —
 * see assertAllowedAssistant() — and placing an actual outbound call is
 * always a founder-triggered action from the dashboard (identity.md
 * boundary #6), never something an agent does autonomously.
 *
 * Runs in mock mode (logs, never dials) until VAPI_PRIVATE_API_KEY and
 * VAPI_PHONE_NUMBER_ID are set, same pattern as lib/payments.ts.
 */
import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const ALLOWED_ASSISTANTS = {
  coldCall: env.VAPI_ASSISTANT_ID_COLD_CALL,
  websiteDemo: env.VAPI_ASSISTANT_ID_WEBSITE_DEMO,
} as const;

export class VapiScopeError extends Error {
  constructor(assistantId: string) {
    super(
      `Refusing to touch Vapi assistant "${assistantId}" — only the Cold Call ` +
        `(${ALLOWED_ASSISTANTS.coldCall}) and Website Demo (${ALLOWED_ASSISTANTS.websiteDemo}) ` +
        `assistants are allowed. Update ALLOWED_ASSISTANTS in lib/vapi.ts if this is intentional.`
    );
    this.name = "VapiScopeError";
  }
}

export function assertAllowedAssistant(assistantId: string): void {
  const allowed = Object.values(ALLOWED_ASSISTANTS) as string[];
  if (!allowed.includes(assistantId)) {
    throw new VapiScopeError(assistantId);
  }
}

export interface ColdCallResult {
  mock: boolean;
  vapiCallId: string;
  status: "queued" | "in_progress";
}

export async function startColdCall(input: { prospectPhone: string; prospectName: string }): Promise<ColdCallResult> {
  assertAllowedAssistant(ALLOWED_ASSISTANTS.coldCall);

  if (!env.VAPI_PRIVATE_API_KEY || !env.VAPI_PHONE_NUMBER_ID) {
    const mockCallId = `mock_call_${randomUUID().slice(0, 12)}`;
    logger.info(
      { prospectName: input.prospectName, prospectPhone: input.prospectPhone, mockCallId },
      "[mock vapi] would place a cold call — set VAPI_PRIVATE_API_KEY and VAPI_PHONE_NUMBER_ID to go live"
    );
    return { mock: true, vapiCallId: mockCallId, status: "queued" };
  }

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.VAPI_PRIVATE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      assistantId: ALLOWED_ASSISTANTS.coldCall,
      phoneNumberId: env.VAPI_PHONE_NUMBER_ID,
      customer: { number: input.prospectPhone, name: input.prospectName },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Vapi call creation failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { id: string; status?: string };
  logger.info({ vapiCallId: data.id, prospectName: input.prospectName }, "cold call placed via Vapi");
  return { mock: false, vapiCallId: data.id, status: "in_progress" };
}
