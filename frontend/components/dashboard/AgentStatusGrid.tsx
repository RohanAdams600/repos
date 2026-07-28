import type { DashboardOverview } from "@/lib/types";

const AGENTS = [
  { id: "scout", name: "Scout", role: "Research Agent" },
  { id: "wordsmith", name: "Wordsmith", role: "Content Agent" },
  { id: "patch", name: "Patch", role: "Coding/Dev Agent" },
  { id: "warden", name: "Warden", role: "Review Agent" },
] as const;

export function AgentStatusGrid({ runCounts }: { runCounts: DashboardOverview["runCounts"] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {AGENTS.map((agent) => {
        const counts = runCounts.filter((row) => row.agent === agent.id);
        const completed = Number(counts.find((c) => c.status === "completed")?.count ?? 0);
        const failed = Number(counts.find((c) => c.status === "failed")?.count ?? 0);
        const queued = Number(counts.find((c) => c.status === "queued_for_review")?.count ?? 0);
        const total = completed + failed + queued;
        const healthy = total === 0 || failed / total < 0.1;

        return (
          <div key={agent.id} className="card-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold">{agent.name}</h3>
                <p className="text-xs text-muted">{agent.role}</p>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-signal-money" : "bg-red-500"}`}
                title={healthy ? "Healthy" : "Elevated failure rate"}
              />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <dt className="text-muted">Done</dt>
                <dd className="font-display text-lg font-bold text-signal-money">{completed}</dd>
              </div>
              <div>
                <dt className="text-muted">Review</dt>
                <dd className="font-display text-lg font-bold text-signal-status">{queued}</dd>
              </div>
              <div>
                <dt className="text-muted">Failed</dt>
                <dd className="font-display text-lg font-bold text-red-500">{failed}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
