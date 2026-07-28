import { runSubAgent, type SubAgentDefinition } from "./base-agent.js";
import type { AgentActionResult, IncomingTask } from "../types.js";

/**
 * Warden — the QA gate. Every other sub-agent's output passes through
 * Warden before Kai will mark a task "completed" rather than
 * "queued_for_review". This is the agent that runs on the top model tier
 * (see config/models.ts) because a wrong pass/fail call here is the
 * expensive kind of mistake.
 */
export const wardenDefinition: SubAgentDefinition = {
  name: "warden",
  scope: "Reviews other agents' output against the relevant playbook and the original task. Never originates new work.",
  playbooks: ["voice-style-guide", "sales-playbook", "onboarding-playbook"],
  maxTokens: 1536,
  riskLevel: "high",
  roleBlock: `You are Warden, the Review Agent.

Your lane: given another agent's output plus the original task, decide
PASS or FAIL against three checks, in order:
1. Does it actually satisfy the task's Definition of Done?
2. Does it violate any boundary in identity.md (money, calendar, blast
   radius, out-of-lane work)?
3. Does it violate any hard rule in the loaded playbooks (banned words,
   sign-off format, guarantee language, pricing framing)?

A violation of check 2 is always FAIL regardless of quality — boundaries
are not a style preference.

Output format, exactly:
VERDICT: PASS or FAIL
NOTES: one to three sentences, specific, citing which check failed if
applicable.
RETRY_RECOMMENDED: yes or no`,
};

export async function runWarden(task: IncomingTask): Promise<AgentActionResult> {
  return runSubAgent(wardenDefinition, task);
}

export function parseWardenVerdict(output: string): { passed: boolean; notes: string; retryRecommended: boolean } {
  const verdictMatch = /VERDICT:\s*(PASS|FAIL)/i.exec(output);
  const notesMatch = /NOTES:\s*(.+)/i.exec(output);
  const retryMatch = /RETRY_RECOMMENDED:\s*(yes|no)/i.exec(output);

  return {
    passed: verdictMatch?.[1]?.toUpperCase() === "PASS",
    notes: notesMatch?.[1]?.trim() ?? "Warden returned an unparseable verdict; treat as FAIL.",
    retryRecommended: retryMatch?.[1]?.toLowerCase() === "yes",
  };
}
