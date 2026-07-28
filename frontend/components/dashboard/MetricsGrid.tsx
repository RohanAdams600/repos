import type { DashboardOverview } from "@/lib/types";

export function MetricsGrid({ metrics }: { metrics: DashboardOverview["metrics"] }) {
  const cards = [
    { label: "MRR", value: `$${metrics.mrr.toLocaleString()}`, sub: `${metrics.mrrTargetProgressPct}% of $100k target` },
    { label: "Active clients", value: metrics.activeClients.toString(), sub: "paying, status = active" },
    { label: "Waitlist", value: metrics.waitlistCount.toString(), sub: "total signups to date" },
    {
      label: "Avg. lead score",
      value: metrics.averageLeadScore !== null ? metrics.averageLeadScore.toString() : "—",
      sub: "0–100, scored by Scout",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="card-surface p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">{card.label}</div>
          <div className="mt-2 font-display text-3xl font-bold">{card.value}</div>
          <div className="mt-1 text-xs text-muted">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
