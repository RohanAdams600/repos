"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, fetchDashboardOverview } from "@/lib/api";
import type { DashboardOverview } from "@/lib/types";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { AgentStatusGrid } from "@/components/dashboard/AgentStatusGrid";
import { HeartbeatPanel } from "@/components/dashboard/HeartbeatPanel";
import { RunsTable } from "@/components/dashboard/RunsTable";
import { ProspectsPanel } from "@/components/dashboard/ProspectsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

const STORAGE_KEY = "autonoma-dashboard-token";
const POLL_INTERVAL_MS = 30_000;

type Tab = "agents" | "prospects";

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("agents");

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) setToken(stored);
  }, []);

  const load = useCallback(async (activeToken: string) => {
    setLoading(true);
    try {
      const data = await fetchDashboardOverview(activeToken);
      setOverview(data);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("That token was rejected. Check DASHBOARD_TOKEN in the backend and try again.");
        setToken(null);
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        setError("Couldn't reach the backend. Is it running?");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void load(token);
    const interval = setInterval(() => void load(token), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, load]);

  function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    window.sessionStorage.setItem(STORAGE_KEY, tokenInput);
    setToken(tokenInput);
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <form onSubmit={handleLogin} className="card-surface w-full max-w-sm p-8">
          <h1 className="font-display text-xl font-bold">Founder Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Enter the dashboard token to continue.</p>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <label htmlFor="dashboard-token" className="sr-only">
            Dashboard token
          </label>
          <input
            id="dashboard-token"
            type="password"
            required
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Dashboard token"
            className="mt-4 w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
          />
          <button type="submit" className="btn-primary mt-4 w-full">
            Enter
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10">
      <div className="container-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Kai — Orchestrator Control Center</h1>
            <p className="text-sm text-muted">
              Live status for the manager agent, sub-agent bench, and heartbeat loop.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {tab === "agents" && (
              <button onClick={() => void load(token)} className="btn-secondary !px-4 !py-2 text-sm" disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-6 flex gap-2 border-b border-black/5 dark:border-white/10">
          <button
            onClick={() => setTab("agents")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === "agents" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink-900 dark:hover:text-ink-50"
            }`}
          >
            Agent Status
          </button>
          <button
            onClick={() => setTab("prospects")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === "prospects" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink-900 dark:hover:text-ink-50"
            }`}
          >
            Prospects
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

        {tab === "agents" && overview && (
          <div className="mt-8 space-y-8">
            <MetricsGrid metrics={overview.metrics} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="lg:col-span-3">
                <AgentStatusGrid runCounts={overview.runCounts} />
              </div>
              <HeartbeatPanel lastHeartbeat={overview.lastHeartbeat} />
            </div>

            <RunsTable runs={overview.recentRuns} />
          </div>
        )}

        {tab === "prospects" && (
          <div className="mt-8">
            <ProspectsPanel token={token} />
          </div>
        )}
      </div>
    </main>
  );
}
