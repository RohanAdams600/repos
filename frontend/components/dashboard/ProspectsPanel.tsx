"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createProspect, fetchProspects, setProspectStatus, startColdCall } from "@/lib/api";
import type { NewProspectInput, Prospect, ProspectStatus, TeamSize } from "@/lib/types";

const STATUS_STYLE: Record<ProspectStatus, string> = {
  new: "bg-ink-600/20 text-muted",
  approved: "bg-signal-time/15 text-signal-time",
  calling: "bg-signal-status/15 text-signal-status",
  called: "bg-accent/15 text-accent",
  interested: "bg-signal-money/15 text-signal-money",
  not_interested: "bg-red-500/15 text-red-500",
  converted: "bg-signal-money/25 text-signal-money",
};

export function ProspectsPanel({ token }: { token: string }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [callingId, setCallingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const data = await fetchProspects(token);
      setProspects(data);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load prospects.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const teamSize = String(form.get("teamSize"));

    const input: NewProspectInput = {
      businessName: String(form.get("businessName")),
      category: String(form.get("category")),
      phone: String(form.get("phone")),
      city: String(form.get("city") || "") || undefined,
      state: String(form.get("state") || "") || undefined,
      teamSize: teamSize ? (teamSize as TeamSize) : undefined,
      fitReasoning: String(form.get("fitReasoning")),
    };

    try {
      await createProspect(token, input);
      formEvent.currentTarget.reset();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add this prospect.");
    }
  }

  async function handleStatusChange(id: string, status: ProspectStatus) {
    await setProspectStatus(token, id, status);
    await load();
  }

  async function handleCall(prospect: Prospect) {
    const confirmed = window.confirm(
      `Place a real outbound call to ${prospect.business_name} at ${prospect.phone}?\n\nThis triggers the live Autonoma Cold Call assistant.`
    );
    if (!confirmed) return;

    setCallingId(prospect.id);
    try {
      const result = await startColdCall(token, prospect.id);
      if (result.mock) {
        window.alert("Mock mode: no real call was placed. Set VAPI_PRIVATE_API_KEY + VAPI_PHONE_NUMBER_ID to go live.");
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the call.");
    } finally {
      setCallingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card-surface p-6">
        <h3 className="font-display font-bold">ICP: who this list is for</h3>
        <p className="mt-2 text-sm text-muted">
          Low headcount (1-4), limited/early hours, phone-dependent intake, single location,
          service-based. Flagship example: independent auto repair shops that close at 5-6pm with
          no answering service. See <code className="text-xs">agents/playbooks/prospecting-playbook.md</code>{" "}
          for the full scoring rubric.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">Prospects ({prospects.length})</h3>
        <button onClick={() => setShowForm((v) => !v)} className="btn-secondary !px-4 !py-2 text-sm">
          {showForm ? "Cancel" : "+ Add prospect"}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className="card-surface grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
          <input name="businessName" required placeholder="Business name" className="prospect-input" />
          <input name="category" required placeholder="Category (e.g. automotive_repair)" className="prospect-input" />
          <input name="phone" required placeholder="Phone" className="prospect-input" />
          <input name="city" placeholder="City" className="prospect-input" />
          <input name="state" placeholder="State" className="prospect-input" />
          <select name="teamSize" className="prospect-input" defaultValue="">
            <option value="">Team size (optional)</option>
            <option value="1_4">1-4 people</option>
            <option value="5_20">5-20 people</option>
            <option value="21_50">21-50 people</option>
            <option value="50_plus">50+ people</option>
          </select>
          <textarea
            name="fitReasoning"
            required
            minLength={10}
            placeholder="Why this fits the ICP (e.g. closes 5pm, 1 location, no answering service) — and where you found it"
            className="prospect-input sm:col-span-2"
            rows={2}
          />
          <button type="submit" className="btn-primary sm:col-span-2">
            Add to list
          </button>
        </form>
      )}

      <div className="card-surface overflow-x-auto p-6">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Business</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Fit reasoning</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {!loaded && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {loaded && prospects.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  No prospects yet — add one above, or have Scout research a city/vertical you
                  specify (see the prospecting playbook).
                </td>
              </tr>
            )}
            {prospects.map((prospect) => (
              <tr key={prospect.id}>
                <td className="py-2.5 pr-4 font-medium">{prospect.business_name}</td>
                <td className="py-2.5 pr-4 text-muted">{prospect.category}</td>
                <td className="py-2.5 pr-4 text-muted">{prospect.phone}</td>
                <td className="py-2.5 pr-4">
                  <select
                    value={prospect.status}
                    onChange={(e) => void handleStatusChange(prospect.id, e.target.value as ProspectStatus)}
                    className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[prospect.status]}`}
                  >
                    {(
                      ["new", "approved", "calling", "called", "interested", "not_interested", "converted"] as const
                    ).map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="max-w-xs truncate py-2.5 pr-4 text-muted" title={prospect.fit_reasoning}>
                  {prospect.fit_reasoning}
                </td>
                <td className="py-2.5">
                  <button
                    onClick={() => void handleCall(prospect)}
                    disabled={callingId === prospect.id || prospect.status === "calling"}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                  >
                    {callingId === prospect.id ? "Calling…" : "Start Cold Call"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
