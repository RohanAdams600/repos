"use client";

import { useState } from "react";

const ownerExchanges = [
  {
    from: "Kai, how many leads came in this week?",
    to: "14 leads. 11 already followed up within the hour. 3 flagged for you — high intent, no reply yet.",
  },
  {
    from: "Draft the follow-up for the 3 you flagged.",
    to: "Drafted, in your voice, using the style guide. Queued for your review — nothing sends until you approve it.",
  },
  {
    from: "Any client at risk of churning?",
    to: "One — response time slipped on their last 2 tickets. Flagged to you same heartbeat cycle, not batched.",
  },
];

const customerExchanges = [
  {
    from: "Hey, do you have any openings this week for an oil change?",
    to: "Yes — Tuesday 2pm or Thursday 10am both open. Want me to book one for you?",
  },
  {
    from: "Can I get a quote for a brake job on a 2019 Civic?",
    to: "Ballpark is $220-280 depending on pad wear. I can get you an exact quote if you swing by for a quick look — want a time?",
  },
];

type View = "owner" | "customer";

export function OwnerControl() {
  const [view, setView] = useState<View>("owner");
  const exchanges = view === "owner" ? ownerExchanges : customerExchanges;

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

          <div className="card-surface p-6">
            <div className="flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5">
              <button
                onClick={() => setView("owner")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === "owner" ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50" : "text-muted"
                }`}
              >
                Owner view
              </button>
              <button
                onClick={() => setView("customer")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === "customer" ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50" : "text-muted"
                }`}
              >
                Customer view
              </button>
            </div>

            <p className="mt-4 text-xs text-muted">
              {view === "owner"
                ? "What you see talking to Kai directly."
                : "What your own customers see texting or emailing your business."}
            </p>

            <div className="mt-4 space-y-4">
              {exchanges.map((exchange) => (
                <div key={exchange.from} className="space-y-2">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">
                    {exchange.from}
                  </div>
                  <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-black/[0.04] px-4 py-2.5 text-sm dark:bg-white/10">
                    {exchange.to}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
