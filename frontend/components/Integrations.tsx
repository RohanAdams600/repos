const integrations = [
  { name: "Gmail / Outlook", category: "Inbox", initials: "@" },
  { name: "Google Calendar", category: "Calendar", initials: "GC" },
  { name: "HubSpot", category: "CRM", initials: "HS" },
  { name: "Salesforce", category: "CRM", initials: "SF" },
  { name: "Pipedrive", category: "CRM", initials: "PD" },
  { name: "Vapi", category: "Voice AI", initials: "VP" },
  { name: "Slack", category: "Messaging", initials: "SL" },
  { name: "Stripe", category: "Billing", initials: "$" },
  { name: "Shopify", category: "E-commerce", initials: "SH" },
  { name: "Zapier", category: "Automation", initials: "ZP" },
  { name: "Notion", category: "Docs", initials: "N" },
  { name: "QuickBooks", category: "Accounting", initials: "QB" },
] as const;

export function Integrations() {
  return (
    <section id="integrations" className="border-y border-black/5 bg-white py-24 dark:border-white/10 dark:bg-ink-900">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Where we plug in</span>
          <h2 className="section-heading mt-3">Your tools. We build around what you already use.</h2>
          <p className="mt-4 text-muted">
            No migration, no new system to learn. Agents operate inside the inbox, CRM, calendar,
            and voice line you already run your business on.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {integrations.map((tool) => (
            <div key={tool.name} className="card-surface flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 font-display text-sm font-bold text-accent">
                {tool.initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{tool.name}</div>
                <div className="text-xs text-muted">{tool.category}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-md text-center text-xs text-muted">
          Don&apos;t see your stack? We build custom integrations on the Scale tier — ask on your
          kickoff call.
        </p>
      </div>
    </section>
  );
}
