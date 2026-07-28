"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SHOW_AFTER_PX = 800;
const DISMISS_KEY = "autonoma-sticky-cta-dismissed";

export function StickyCta() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }

    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function dismiss() {
    setDismissed(true);
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  }

  if (dismissed || !visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-ink-50/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-ink-950/95">
      <div className="container-page flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          <span className="hidden sm:inline">Reserve your onboarding slot — </span>
          6 spots a month, live in 14 days.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/waitlist" className="btn-primary !px-4 !py-2 text-sm">
            Reserve your spot
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
