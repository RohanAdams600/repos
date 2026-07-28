/**
 * State access for agents, entirely over HTTP against /backend's narrow
 * `/api/agents/*` surface — agents hold no direct database credentials at
 * all. This is the strongest version of identity.md boundary #5
 * ("no destructive DB ops for agents"): there is nothing to misuse
 * because there is no DB connection to have in the first place. If a new
 * capability is needed, add a matching narrow endpoint in
 * backend/src/routes/agents.ts and a function here — never widen this
 * into a generic passthrough.
 */
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import type { LoopRunRecord } from "../types.js";

async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${env.BACKEND_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Backend request failed: ${init.method ?? "GET"} ${path} -> ${response.status} ${body}`);
  }

  return response;
}

export async function recordAgentRun(run: LoopRunRecord): Promise<void> {
  await backendFetch("/api/agents/runs", {
    method: "POST",
    body: JSON.stringify({
      taskId: run.taskId,
      taskType: run.taskType,
      agent: run.agent,
      status: run.status,
      attempt: run.attempt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      assessmentPassed: run.assessment?.passed ?? null,
      assessmentNotes: run.assessment?.notes ?? null,
    }),
  }).catch((err) => {
    logger.error({ err, taskId: run.taskId }, "recordAgentRun failed");
    throw err;
  });
}

export async function recordHeartbeat(summary: {
  tasksProcessed: number;
  tasksFailed: number;
  trustStage: string;
}): Promise<void> {
  await backendFetch("/api/agents/heartbeats", {
    method: "POST",
    body: JSON.stringify(summary),
  });
}

export async function appendLeadScore(leadId: string, score: number, notes: string): Promise<void> {
  await backendFetch(`/api/agents/leads/${leadId}/score`, {
    method: "PATCH",
    body: JSON.stringify({ score, notes }),
  });
}

export async function fetchUnscoredLeads(limit = 25): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  const response = await backendFetch(`/api/agents/leads/unscored?limit=${limit}`);
  const data = (await response.json()) as { leads: { id: string; payload: Record<string, unknown> }[] };
  return data.leads;
}

export async function fetchRecentGuaranteeSLABreaches(): Promise<{ clientId: string; kickoffAt: string }[]> {
  const response = await backendFetch("/api/agents/guarantee-breaches");
  const data = (await response.json()) as { breaches: { clientId: string; kickoffAt: string }[] };
  return data.breaches;
}

export async function markGuaranteeFlagged(clientId: string): Promise<void> {
  await backendFetch(`/api/agents/guarantee-breaches/${clientId}/flag`, { method: "POST" });
}

/** No-op kept for API symmetry with a previous direct-DB implementation; nothing to close over HTTP. */
export async function closeDb(): Promise<void> {
  return;
}
