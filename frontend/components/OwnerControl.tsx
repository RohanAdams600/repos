const exchanges = [
  {
    command: "Kai, how many leads came in this week?",
    response: "14 leads. 11 already followed up within the hour. 3 flagged for you — high intent, no reply yet.",
  },
  {
    command: "Draft the follow-up for the 3 you flagged.",
    response:
      "Drafted, in your voice, using the style guide. Queued for your review — nothing sends until you approve it.",
  },
  {
    command: "Any client at risk of churning?",
    response: "One — response time slipped on their last 2 tickets. Flagged to you same heartbeat cycle, not batched.",
  },
];

export function OwnerControl() {
  return (
    <section className="py-24">
      <div className="container-page">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="eyebrow">Owner control</span>
            <h2 className="section-heading mt-3">You&apos;re always the one holding the reins.</h2>
            <p className="mt-4 text-muted">
              Ask Kai anything about what&apos;s running, what got flagged, or what&apos;s waiting on you —
              in plain English, no dashboard-diving required. Anything client-impacting or
              boundary-crossing (money, your calendar) always comes back to you first.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                Every agent output is reviewed before it counts as done
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                Money and calendar changes never happen without your sign-off
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                You can loosen or tighten how much runs unattended, any time
              </li>
            </ul>
          </div>

          <div className="card-surface space-y-4 p-6">
            {exchanges.map((exchange) => (
              <div key={exchange.command} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">
                  {exchange.command}
                </div>
                <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-black/[0.04] px-4 py-2.5 text-sm dark:bg-white/10">
                  {exchange.response}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
