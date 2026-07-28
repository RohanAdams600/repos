import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-black/5 py-12 dark:border-white/10">
      <div className="container-page flex flex-col items-center justify-between gap-6 text-sm text-muted md:flex-row">
        <div className="font-display font-semibold text-ink-900 dark:text-ink-50">Autonoma</div>
        <p>We build and run the AI agents. You get your week back.</p>
        <div className="flex gap-6">
          <Link href="/waitlist" className="transition hover:text-accent">
            Waitlist
          </Link>
          <Link href="/dashboard" className="transition hover:text-accent">
            Founder Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
