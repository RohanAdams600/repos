"use client";

import { useEffect, useRef, useState } from "react";

interface Stat {
  target: number;
  suffix: string;
  prefix?: string;
  label: string;
}

const stats: Stat[] = [
  { target: 14, suffix: " days", label: "to your first live agent — or that month is free" },
  { target: 20, prefix: "up to ", suffix: " hrs/wk", label: "reclaimed from repetitive ops work" },
  { target: 5, suffix: "", label: "agents on the bench — 1 orchestrator, 4 specialists" },
  { target: 6, suffix: "", label: "new Core/Scale clients accepted per month, on purpose" },
];

function useCountUp(target: number, active: boolean, durationMs = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);

  return value;
}

export function StatsBar() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionRef} className="border-y border-black/5 bg-white py-14 dark:border-white/10 dark:bg-ink-900">
      <div className="container-page grid grid-cols-2 gap-8 sm:grid-cols-4">
        {stats.map((stat) => (
          <StatItem key={stat.label} stat={stat} active={inView} />
        ))}
      </div>
    </div>
  );
}

function StatItem({ stat, active }: { stat: Stat; active: boolean }) {
  const value = useCountUp(stat.target, active);

  return (
    <div className="text-center">
      <div className="font-display text-3xl font-bold text-accent sm:text-4xl">
        {stat.prefix}
        {value}
        {stat.suffix}
      </div>
      <div className="mt-2 text-xs text-muted sm:text-sm">{stat.label}</div>
    </div>
  );
}
