const faqs = [
  {
    q: "What exactly do I get for $4,000/month on Core?",
    a: "An orchestrator agent plus up to 4 sub-agents, configured inside your actual inbox, CRM, and calendar — not a demo. Biweekly working sessions to expand scope as you see what's working.",
  },
  {
    q: "Why isn't this fully self-serve software?",
    a: "Because most owner-operators don't want another app to configure — they want the outcome. We do the setup and operation; you get the hours back. Starter exists if you'd rather DIY it with our playbooks.",
  },
  {
    q: "What happens after the $200 deposit?",
    a: "It reserves your onboarding slot and is credited against your first month. You'll get a kickoff call within days, not weeks — we only take 6 new Core/Scale clients a month.",
  },
  {
    q: "What if it's not working for us?",
    a: "If your first agent isn't live inside 14 days of kickoff, that month is free — tracked automatically, not something you have to chase down. After that, it's month-to-month, cancel anytime.",
  },
  {
    q: "What can't the agents touch?",
    a: "Money movement and your calendar, unless you explicitly authorize a specific action. Every agent operates inside a narrow, named scope — that boundary is enforced in code, not just policy.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">FAQ</span>
          <h2 className="section-heading mt-3">Questions worth answering up front.</h2>
        </div>

        <div className="mx-auto mt-14 max-w-2xl space-y-4">
          {faqs.map((faq) => (
            <details key={faq.q} className="card-surface group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display font-semibold">
                {faq.q}
                <svg
                  className="h-4 w-4 flex-shrink-0 text-muted transition group-open:rotate-45"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                </svg>
              </summary>
              <p className="mt-3 text-sm text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
