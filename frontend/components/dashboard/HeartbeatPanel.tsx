import type { DashboardOverview } from "@/lib/types";

const TRUST_STAGE_COPY: Record<string, string> = {
  manual: "Every output reviewed by the founder. Nothing auto-executes.",
  supervised: "Low-risk tasks auto-execute. Everything else queues for review.",
  autonomous: "Heartbeat loop runs unattended. Hard boundaries still gate high-risk output.",
};

export function HeartbeatPanel({ lastHeartbeat }: { lastHeartbeat: DashboardOverview["lastHeartbeat"] }) {
  return (
    <div className="card-surface p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">Heartbeat Loop</h3>
        {lastHeartbeat && (
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Trust stage: {lastHeartbeat.trust_stage}
          </span>
        )}
      </div>

      {lastHeartbeat ? (
        <>
          <p className="mt-2 text-xs text-muted">{TRUST_STAGE_COPY[lastHeartbeat.trust_stage]}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <dt className="text-muted">Processed</dt>
              <dd className="font-display text-lg font-bold">{lastHeartbeat.tasks_processed}</dd>
            </div>
            <div>
              <dt className="text-muted">Failed</dt>
              <dd className="font-display text-lg font-bold text-red-500">{lastHeartbeat.tasks_failed}</dd>
            </div>
            <div>
              <dt className="text-muted">Last run</dt>
              <dd className="font-display text-sm font-bold">
                {new Date(lastHeartbeat.ran_at).toLocaleTimeString()}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">No heartbeat cycles recorded yet.</p>
      )}
    </div>
  );
}
