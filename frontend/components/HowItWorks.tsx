const steps = [
  {
    step: "01",
    title: "Reserve your spot",
    detail:
      "Join the waitlist, answer a few qualification questions, put down a $200 deposit. That deposit is credited against your first month.",
  },
  {
    step: "02",
    title: "Kickoff call",
    detail:
      "30 minutes with the founder. We confirm your biggest time-sink, what tools you're in, and what access we need.",
  },
  {
    step: "03",
    title: "We build, you keep running your business",
    detail:
      "Our research agent audits your workflow, our dev agent configures your orchestrator and first sub-agent, our review agent QAs everything before it touches your real tools.",
  },
  {
    step: "04",
    title: "Live inside 14 days",
    detail:
      "Your first agent goes live — or that month is free. From there, biweekly sessions keep expanding what's automated.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-black/5 bg-white py-24 dark:border-white/10 dark:bg-ink-900">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="section-heading mt-3">From deposit to a live agent in 14 days.</h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <div key={item.step}>
              <div className="font-display text-3xl font-bold text-accent/40">{item.step}</div>
              <h3 className="mt-3 font-display text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
