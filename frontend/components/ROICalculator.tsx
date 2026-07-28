"use client";

import { useState } from "react";
import Link from "next/link";
import { calculateRoi, RECLAIM_RATE } from "@/lib/roi";

export function ROICalculator() {
  const [hoursPerWeek, setHoursPerWeek] = useState(15);
  const [hourlyRate, setHourlyRate] = useState(75);

  const result = calculateRoi(hoursPerWeek, hourlyRate);

  return (
    <section className="py-24">
      <div className="container-page">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="eyebrow">See your own number</span>
            <h2 className="section-heading mt-3">What&apos;s your time actually worth back?</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Move the sliders to your real numbers. This is an estimate based on a stated
              assumption, not a claimed average — we&apos;re a young company and won&apos;t pretend
              otherwise.
            </p>
          </div>

          <div className="card-surface mt-10 grid grid-cols-1 gap-8 p-8 sm:grid-cols-2">
            <div>
              <label htmlFor="roi-hours" className="mb-2 block text-sm font-medium">
                Hours/week on repetitive follow-up, admin, or reporting
              </label>
              <input
                id="roi-hours"
                type="range"
                min={1}
                max={40}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="mt-1 text-sm text-muted">{hoursPerWeek} hrs/week</div>
            </div>

            <div>
              <label htmlFor="roi-rate" className="mb-2 block text-sm font-medium">
                What&apos;s an hour of your time worth?
              </label>
              <input
                id="roi-rate"
                type="range"
                min={20}
                max={300}
                step={5}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="mt-1 text-sm text-muted">${hourlyRate}/hr</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card-surface p-6 text-center">
              <div className="font-display text-3xl font-bold text-accent">{result.weeklyHoursReclaimed}</div>
              <div className="mt-1 text-xs text-muted">hrs/week reclaimed</div>
            </div>
            <div className="card-surface p-6 text-center">
              <div className="font-display text-3xl font-bold text-accent">{result.annualHoursReclaimed}</div>
              <div className="mt-1 text-xs text-muted">hrs/year reclaimed</div>
            </div>
            <div className="card-surface p-6 text-center">
              <div className="font-display text-3xl font-bold text-accent">
                ${result.annualDollarValue.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted">worth per year, at your rate</div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted">
            Assumes Autonoma reclaims {Math.round(RECLAIM_RATE * 100)}% of the time you enter above —
            a stated assumption for this calculator, adjust the sliders to test your own case.
          </p>

          <div className="mt-8 text-center">
            <Link href="/waitlist" className="btn-primary">
              See if Core is a fit for you
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
