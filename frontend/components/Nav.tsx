import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-ink-50/80 backdrop-blur-md dark:border-white/10 dark:bg-ink-950/80">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          Autonoma
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
          <Link href="/#offer" className="transition hover:text-accent">
            The Offer
          </Link>
          <Link href="/#how-it-works" className="transition hover:text-accent">
            How It Works
          </Link>
          <Link href="/#agents" className="transition hover:text-accent">
            The Agents
          </Link>
          <Link href="/#integrations" className="transition hover:text-accent">
            Integrations
          </Link>
          <Link href="/#pricing" className="transition hover:text-accent">
            Pricing
          </Link>
          <Link href="/#faq" className="transition hover:text-accent">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/waitlist" className="btn-primary !px-5 !py-2.5 text-sm">
            Reserve your spot
          </Link>
        </div>
      </div>
    </header>
  );
}
