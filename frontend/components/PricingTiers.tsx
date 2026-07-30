import Link from "next/link";

const tiers = [
  {
    id: "starter",
    name: "Starter",
    price: "$1,000",
    cadence: "/mo",
    tagline: "DIY playbooks & templates",
    description:
      "Self-serve access to our agent playbooks, prompt libraries, and setup templates. You build it yourself.",
    features: [
      "Full agent playbook library",
      "Setup templates for inbox, CRM, calendar",
      "Community support (async, best-effort)",
      "No done-with-you build time",
    ],
    cta: "Start DIY",
    featured: false,
  },
  {
    id: "core",
    name: "Core",
    price: "$4,000",
    cadence: "/mo",
    tagline: "Done-with-you — the target offer",
    description:
      "We build and operate 1 orchestrator agent + up to 4 sub-agents inside your actual tools. Biweekly working sessions.",
    features: [
      "Everything in Starter",
      "1 orchestrator + up to 4 sub-agents, built for your stack",
      "Live inside 14 days or the month is free",
      "Biweekly working sessions with your build team",
      "Same-business-day response on client-impacting issues",
    ],
    cta: "Reserve your slot",
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: "$20,000",
    cadence: "/mo",
    tagline: "Fully done-for-you",
    description:
      "A dedicated build team, custom integrations beyond our standard stack, and weekly strategy calls with the founder.",
    features: [
      "Everything in Core",
      "Dedicated build team, not shared capacity",
      "Custom integrations (proprietary tools, internal systems)",
      "Weekly strategy calls with the founder",
      "Priority escalation on everything",
    ],
    cta: "Talk to us",
    featured: false,
  },
] as const;

export function PricingTiers() {
  return (
    <section id="pricing" className="py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Pricing</span>
          <h2 className="section-heading mt-3">One offer to sell. Two more to make it obvious.</h2>
          <p className="mt-4 text-muted">
            Most clients land on Core. Starter exists for people who want to do it themselves.
            Scale exists for people who want us to do everything — and makes Core look like exactly
            what it is: the sweet spot.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`card-surface flex flex-col p-8 ${
                tier.featured ? "relative border-2 border-accent shadow-glow lg:-translate-y-3" : ""
              }`}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white">
                  Most clients choose this
                </span>
              )}
              <div className="eyebrow">{tier.tagline}</div>
              <h3 className="mt-2 font-display text-2xl font-bold">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{tier.price}</span>
                <span className="text-muted">{tier.cadence}</span>
              </div>
              <p className="mt-4 text-sm text-muted">{tier.description}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-signal-money"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/waitlist"
                className={`mt-8 ${tier.featured ? "btn-primary" : "btn-secondary"} w-full`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
