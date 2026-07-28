export function Scarcity() {
  return (
    <section className="py-8">
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 rounded-full border border-signal-status/30 bg-signal-status/10 px-6 py-3 text-center text-sm font-medium text-signal-status">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-slow rounded-full bg-signal-status opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-status" />
          </span>
          We onboard a maximum of 6 new Core/Scale clients per month to protect the 14-day
          guarantee — the rest join the waitlist for next month&apos;s cohort.
        </div>
      </div>
    </section>
  );
}
