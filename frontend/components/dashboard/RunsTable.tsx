import type { DashboardOverview } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-signal-money/15 text-signal-money",
  failed: "bg-red-500/15 text-red-500",
  queued_for_review: "bg-signal-status/15 text-signal-status",
  blocked: "bg-ink-600/20 text-muted",
};

export function RunsTable({ runs }: { runs: DashboardOverview["recentRuns"] }) {
  return (
    <div className="card-surface overflow-x-auto p-6">
      <h3 className="font-display font-bold">Recent Agent Runs</h3>
      <table className="mt-4 w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4">Agent</th>
            <th className="py-2 pr-4">Task type</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Attempt</th>
            <th className="py-2 pr-4">Finished</th>
            <th className="py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/10">
          {runs.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted">
                No runs yet.
              </td>
            </tr>
          )}
          {runs.map((run) => (
            <tr key={`${run.task_id}-${run.attempt}`}>
              <td className="py-2.5 pr-4 font-medium capitalize">{run.agent}</td>
              <td className="py-2.5 pr-4 text-muted">{run.task_type}</td>
              <td className="py-2.5 pr-4">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[run.status]}`}>
                  {run.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-muted">{run.attempt}</td>
              <td className="py-2.5 pr-4 text-muted">{new Date(run.finished_at).toLocaleString()}</td>
              <td className="py-2.5 text-muted">{run.assessment_notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
