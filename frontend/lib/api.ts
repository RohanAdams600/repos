import type { DashboardOverview, NewProspectInput, Prospect, ProspectStatus, Tier, WaitlistInput } from "./types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function submitWaitlist(input: WaitlistInput): Promise<{ id: string; email: string }> {
  const res = await fetch(`${BACKEND_URL}/api/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError("Couldn't submit the waitlist form. Check your details and try again.", res.status);
  return res.json();
}

export async function createDepositCheckout(email: string): Promise<{ url: string; mock: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/checkout/deposit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new ApiError("Couldn't start checkout. Make sure you've joined the waitlist first.", res.status);
  return res.json();
}

export async function createSubscriptionCheckout(input: {
  email: string;
  businessName: string;
  tier: Tier;
}): Promise<{ url: string; mock: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/checkout/subscription`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError("Couldn't start subscription checkout.", res.status);
  return res.json();
}

/** Resolves the session id from the checkout success redirect to the actual agent download — see backend/src/routes/downloads.ts. */
export async function resolveAgentDownload(sessionId: string): Promise<{ token: string; tier: Tier }> {
  const res = await fetch(`${BACKEND_URL}/api/downloads/agent/by-session/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new ApiError("Couldn't find a download for this checkout session.", res.status);
  return res.json();
}

/** The actual download link — a direct browser navigation target, not a fetch call (it's a file download). */
export function agentDownloadUrl(token: string): string {
  return `${BACKEND_URL}/api/downloads/agent/${encodeURIComponent(token)}`;
}

export async function fetchDashboardOverview(token: string): Promise<DashboardOverview> {
  const res = await fetch(`${BACKEND_URL}/api/dashboard/overview`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError("Invalid dashboard token or backend unreachable.", res.status);
  return res.json();
}

export async function fetchProspects(token: string): Promise<Prospect[]> {
  const res = await fetch(`${BACKEND_URL}/api/prospects`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError("Couldn't load prospects.", res.status);
  const data = await res.json();
  return data.prospects;
}

export async function createProspect(token: string, input: NewProspectInput): Promise<Prospect> {
  const res = await fetch(`${BACKEND_URL}/api/prospects`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError("Couldn't add this prospect.", res.status);
  const data = await res.json();
  return data.prospect;
}

export async function setProspectStatus(token: string, id: string, status: ProspectStatus): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/prospects/${id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new ApiError("Couldn't update this prospect's status.", res.status);
}

/**
 * The approval gate: this is a founder-authenticated action (dashboard
 * token) placing a real outbound call via the Autonoma Cold Call
 * assistant. There is no lower-friction path to this — see
 * identity.md boundary #6.
 */
export async function startColdCall(token: string, prospectId: string): Promise<{ mock: boolean; vapiCallId: string }> {
  const res = await fetch(`${BACKEND_URL}/api/vapi/cold-call/${prospectId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError("Couldn't start the call.", res.status);
  return res.json();
}
