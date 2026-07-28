"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function WaitlistSuccessContent() {
  const searchParams = useSearchParams();
  const isMock = searchParams.get("mock") === "1";

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
