import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-20 sm:pt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(109,91,255,0.18),transparent_60%)]"
      />
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow animate-fade-up">For owner-operators doing $1M–$20M/yr</span>
          <h1
            className="mt-5 animate-fade-up font-display text-4xl font-bold tracking-tight sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            We build the AI agents that run your ops —{" "}
            <span className="bg-gradient-to-r from-accent to-signal-time bg-clip-text text-transparent">
              you get 10–20 hours a week back.
            </span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl animate-fade-up text-lg text-muted"
            style={{ animationDelay: "160ms" }}
          >
            No hiring. No learning to code. We design, build, and operate a working set of
            agents inside your inbox, CRM, and calendar — done with you, live inside 14 days.
          </p>
          <div
            className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "240ms" }}
          >
            <Link href="/waitlist" className="btn-primary">
              Reserve your onboarding slot
            </Link>
            <Link href="#pricing" className="btn-secondary">
              See pricing
            </Link>
          </div>
          <p className="mt-4 animate-fade-up text-xs text-muted" style={{ animationDelay: "280ms" }}>
            $200 refundable deposit to reserve your slot. No charge for the core plan until kickoff.
          </p>
        </div>
      </div>
    </section>
  );
}
