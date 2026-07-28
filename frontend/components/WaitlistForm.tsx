"use client";

import { useState, type FormEvent } from "react";
import { ApiError, createDepositCheckout, submitWaitlist } from "@/lib/api";
import type { RevenueBand, TeamSize, Tier } from "@/lib/types";

type Step = "form" | "submitted" | "error";

const revenueBands: { value: RevenueBand; label: string }[] = [
  { value: "under_20k", label: "Under $20k/mo" },
  { value: "20k_80k", label: "$20k–$80k/mo" },
  { value: "80k_250k", label: "$80k–$250k/mo" },
  { value: "250k_plus", label: "$250k+/mo" },
];

const teamSizes: { value: TeamSize; label: string }[] = [
  { value: "1_4", label: "1–4 people" },
  { value: "5_20", label: "5–20 people" },
  { value: "21_50", label: "21–50 people" },
  { value: "50_plus", label: "50+ people" },
];

const tiers: { value: Tier; label: string }[] = [
  { value: "starter", label: "Starter — $500/mo (DIY)" },
  { value: "core", label: "Core — $1,000/mo (done-with-you)" },
  { value: "scale", label: "Scale — $10,000/mo (done-for-you)" },
];

export function WaitlistForm() {
  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    const form = new FormData(formEvent.currentTarget);
    const submittedEmail = String(form.get("email"));

    try {
      await submitWaitlist({
        email: submittedEmail,
        businessName: String(form.get("businessName")),
        revenueBand: form.get("revenueBand") as RevenueBand,
        teamSize: form.get("teamSize") as TeamSize,
        timeSink: String(form.get("timeSink")),
        tierInterest: form.get("tierInterest") as Tier,
        referredByClient: form.get("referredByClient") === "on",
      });
      setEmail(submittedEmail);
      setStep("submitted");
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeposit() {
    setCheckoutLoading(true);
    try {
      const { url } = await createDepositCheckout(email);
      window.location.href = url;
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Couldn't start checkout. Try again.");
      setCheckoutLoading(false);
    }
  }

  if (step === "submitted") {
    return (
      <div className="card-surface p-8 text-center">
        <h3 className="font-display text-xl font-bold">You&apos;re on the list.</h3>
        <p className="mt-2 text-sm text-muted">
          Put down a $200 deposit to reserve your onboarding slot now — it&apos;s credited against
          your first month, and it&apos;s what starts your 14-day clock.
        </p>
        {errorMessage && <p className="mt-3 text-sm text-red-500">{errorMessage}</p>}
        <button onClick={handleDeposit} disabled={checkoutLoading} className="btn-primary mt-6 w-full">
          {checkoutLoading ? "Redirecting to checkout…" : "Reserve with a $200 deposit"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface space-y-5 p-8">
      {step === "error" && errorMessage && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{errorMessage}</p>
      )}

      <div>
        <label htmlFor="wf-email" className="mb-1.5 block text-sm font-medium">
          Work email
        </label>
        <input
          id="wf-email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
        />
      </div>

      <div>
        <label htmlFor="wf-business-name" className="mb-1.5 block text-sm font-medium">
          Business name
        </label>
        <input
          id="wf-business-name"
          name="businessName"
          type="text"
          required
          minLength={2}
          placeholder="Acme Services LLC"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="wf-revenue-band" className="mb-1.5 block text-sm font-medium">
            Monthly revenue
          </label>
          <select
            id="wf-revenue-band"
            name="revenueBand"
            required
            defaultValue=""
            className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
          >
            <option value="" disabled>
              Select…
            </option>
            {revenueBands.map((band) => (
              <option key={band.value} value={band.value}>
                {band.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="wf-team-size" className="mb-1.5 block text-sm font-medium">
            Team size
          </label>
          <select
            id="wf-team-size"
            name="teamSize"
            required
            defaultValue=""
            className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
          >
            <option value="" disabled>
              Select…
            </option>
            {teamSizes.map((size) => (
              <option key={size.value} value={size.value}>
                {size.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="wf-time-sink" className="mb-1.5 block text-sm font-medium">
          What&apos;s the one recurring task eating the most of your week?
        </label>
        <textarea
          id="wf-time-sink"
          name="timeSink"
          required
          minLength={10}
          rows={3}
          placeholder="e.g. Manually following up with every inbound lead within a few hours, every day"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
        />
      </div>

      <div>
        <label htmlFor="wf-tier-interest" className="mb-1.5 block text-sm font-medium">
          Which tier are you leaning toward?
        </label>
        <select
          id="wf-tier-interest"
          name="tierInterest"
          required
          defaultValue="core"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15"
        >
          {tiers.map((tier) => (
            <option key={tier.value} value={tier.value}>
              {tier.label}
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="wf-referred" className="flex items-center gap-2 text-sm text-muted">
        <input id="wf-referred" name="referredByClient" type="checkbox" className="h-4 w-4 rounded border-black/20" />
        I was referred by an existing client
      </label>

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Submitting…" : "Join the waitlist"}
      </button>
    </form>
  );
}
