const outcomes = [
  {
    label: "Time",
    color: "text-signal-time",
    stat: "10–20 hrs/wk",
    detail: "reclaimed from inbox triage, follow-ups, and reporting you shouldn't be doing by hand.",
  },
  {
    label: "Money",
    color: "text-signal-money",
    stat: "0 dropped leads",
    detail: "every inbound lead gets a same-hour first touch, drafted in your voice, flagged if it's a hot one.",
  },
  {
    label: "Status",
    color: "text-signal-status",
    stat: "The business that runs itself",
    detail: "be the operator in your peer group whose ops don't fall apart when you take a week off.",
  },
];

export function OutcomeBar() {
  return (
    <section className="border-y border-black/5 bg-white py-14 dark:border-white/10 dark:bg-ink-900">
      <div className="container-page grid grid-cols-1 gap-8 sm:grid-cols-3">
        {outcomes.map((outcome) => (
          <div key={outcome.label} className="text-center sm:text-left">
            <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${outcome.color}`}>{outcome.label}</div>
            <div className="mt-2 font-display text-2xl font-bold">{outcome.stat}</div>
            <p className="mt-2 text-sm text-muted">{outcome.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
