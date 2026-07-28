import type { DashboardOverview, Tier, WaitlistInput } from "./types";

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

export async function createDepositCheckout(email: string): Promise<{ url: string }> {
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
}): Promise<{ url: string }> {
  const res = await fetch(`${BACKEND_URL}/api/checkout/subscription`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError("Couldn't start subscription checkout.", res.status);
  return res.json();
}

export async function fetchDashboardOverview(token: string): Promise<DashboardOverview> {
  const res = await fetch(`${BACKEND_URL}/api/dashboard/overview`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError("Invalid dashboard token or backend unreachable.", res.status);
  return res.json();
}
