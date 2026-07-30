"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { agentDownloadUrl, resolveAgentDownload } from "@/lib/api";
import { TIER_INFO, type Tier } from "@/lib/types";

function DepositSuccess({ isMock }: { isMock: boolean }) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal-money/15 text-signal-money">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="section-heading mt-6">Deposit received. Your 14-day clock starts now.</h1>
      <p className="mt-4 text-muted">
        You&apos;ll get a kickoff call invite from the founder within one business day. Keep an
        eye on the inbox you signed up with.
      </p>

      {isMock && (
        <p className="mx-auto mt-6 max-w-sm rounded-xl border border-signal-status/30 bg-signal-status/10 px-4 py-3 text-xs text-signal-status">
          Demo mode: this checkout completed without a real charge — payments go live once
          Stripe is connected.
        </p>
      )}

      <Link href="/" className="btn-primary mt-8 inline-flex">
        Back to the site
      </Link>
    </div>
  );
}

function SubscriptionSuccess({ sessionId, tierFromUrl, isMock }: { sessionId: string; tierFromUrl: Tier | null; isMock: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; token: string; tier: Tier } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    resolveAgentDownload(sessionId)
      .then((result) => {
        if (!cancelled) setState({ status: "ready", token: result.token, tier: result.tier });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const tier = state.status === "ready" ? state.tier : tierFromUrl;
  const tierInfo = tier ? TIER_INFO[tier] : null;

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal-money/15 text-signal-money">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="section-heading mt-6">
        {tierInfo ? `You're on ${tierInfo.label}.` : "Subscription active."}
      </h1>
      <p className="mt-4 text-muted">
        Your agent is ready to download and run on your own machine — it&apos;s configured for
        your plan already.
      </p>

      {isMock && (
        <p className="mx-auto mt-6 max-w-sm rounded-xl border border-signal-status/30 bg-signal-status/10 px-4 py-3 text-xs text-signal-status">
          Demo mode: this checkout completed without a real charge — payments go live once
          Stripe is connected.
        </p>
      )}

      <div className="card-surface mt-8 p-6 text-left">
        {tierInfo && (
          <>
            <p className="eyebrow">Your plan runs</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tierInfo.lanes.map((lane) => (
                <li key={lane} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  {lane}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Up to {tierInfo.dailyTaskCap} tasks drafted per day.</p>
          </>
        )}

        <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
          {state.status === "loading" && <p className="text-sm text-muted">Preparing your download…</p>}

          {state.status === "error" && (
            <p className="text-sm text-signal-status">
              Couldn&apos;t find your download. Refresh this page — if it still doesn&apos;t show
              up, email the founder and they&apos;ll send it directly.
            </p>
          )}

          {state.status === "ready" && (
            <>
              <a href={agentDownloadUrl(state.token)} className="btn-primary w-full">
                Download your agent
              </a>
              <ol className="mt-4 space-y-1 text-xs text-muted">
                <li>1. Unzip it anywhere on your computer.</li>
                <li>
                  2. In a terminal, in that folder: <code className="text-accent">npm install</code>
                </li>
                <li>
                  3. Then: <code className="text-accent">npm start</code> — it opens a short setup form the first
                  time.
                </li>
              </ol>
            </>
          )}
        </div>
      </div>

      <Link href="/" className="btn-secondary mt-8 inline-flex">
        Back to the site
      </Link>
    </div>
  );
}

export function WaitlistSuccessContent() {
  const searchParams = useSearchParams();
  const isMock = searchParams.get("mock") === "1";
  const kind = searchParams.get("kind");
  const sessionId = searchParams.get("session_id");
  const tierParam = searchParams.get("tier");
  const tierFromUrl: Tier | null =
    tierParam === "starter" || tierParam === "core" || tierParam === "scale" ? tierParam : null;

  if (kind === "subscription" && sessionId) {
    return <SubscriptionSuccess sessionId={sessionId} tierFromUrl={tierFromUrl} isMock={isMock} />;
  }

  return <DepositSuccess isMock={isMock} />;
}
