export function Guarantee() {
  return (
    <section className="py-20">
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-3xl border border-accent/20 bg-accent/5 p-10 text-center sm:p-14">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 className="section-heading">The 14-Day Live Guarantee</h2>
          <p className="max-w-xl text-muted">
            If we haven&apos;t shipped your first working agent inside 14 days of kickoff, that
            month is free. No exceptions, no fine print. We track this automatically — the day it
            slips, our system flags it before you would ever have to ask.
          </p>
        </div>
      </div>
    </section>
  );
}
