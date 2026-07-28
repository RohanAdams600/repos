const agents = [
  {
    name: "Kai",
    role: "Orchestration Manager",
    detail: "Routes every task to the right specialist, monitors execution, retries failures, reports back to you.",
  },
  {
    name: "Scout",
    role: "Research Agent",
    detail: "Lead scoring, market research, workflow audits. Never writes code, never sends client-facing copy.",
  },
  {
    name: "Wordsmith",
    role: "Content Agent",
    detail: "Drafts emails, sequences, and talking points in your voice. Every draft is reviewed before it sends.",
  },
  {
    name: "Patch",
    role: "Coding / Dev Agent",
    detail: "Implements and fixes the specific, scoped change your build needs — nothing wider than the ticket.",
  },
  {
    name: "Warden",
    role: "Review Agent",
    detail: "QA pass on every other agent's output before it ships. Runs on our highest-accuracy model on purpose.",
  },
];

export function AgentsShowcase() {
  return (
    <section id="agents" className="border-y border-black/5 bg-white py-24 dark:border-white/10 dark:bg-ink-900">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Under the hood</span>
          <h2 className="section-heading mt-3">A real multi-agent system, not a chatbot in a nice UI.</h2>
          <p className="mt-4 text-muted">
            One orchestrator, four specialists, each with exactly one job. Nothing ships without a
            review pass. Nothing crosses a money or calendar boundary without you.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="card-surface p-5 lg:col-span-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent font-display text-sm font-bold text-white">
                {agents[0].name[0]}
              </div>
              <div>
                <div className="font-display font-bold">{agents[0].name}</div>
                <div className="text-xs text-muted">{agents[0].role}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{agents[0].detail}</p>
          </div>

          {agents.slice(1).map((agent) => (
            <div key={agent.name} className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 font-display text-sm font-bold text-accent">
                  {agent.name[0]}
                </div>
                <div>
                  <div className="font-display font-bold">{agent.name}</div>
                  <div className="text-xs text-muted">{agent.role}</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">{agent.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
