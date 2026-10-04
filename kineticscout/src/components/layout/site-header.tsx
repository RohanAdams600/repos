import Link from 'next/link'
import { SignOutForm } from '@/components/pwa/sign-out-form'
import { Logo } from '@/components/brand/logo'
import { SearchIcon } from '@/components/icons'
import { MobileNav, type NavLink } from '@/components/layout/mobile-nav'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button, buttonVariants } from '@/components/ui/button'
import { signOutAction } from '@/lib/auth/actions'
import { getAuthIdentity } from '@/lib/auth/session'

/** Sticky header with skip link, primary navigation, theme toggle and the account entry point. */
export async function SiteHeader() {
  // The header must render even if the auth provider is unreachable; the dashboard enforces auth itself.
  const identity = await getAuthIdentity().catch(() => null)
  const links: NavLink[] = [
    { href: '/pricing', label: 'Pricing' },
    { href: '/events', label: 'Events' },
    { href: '/faq', label: 'FAQ' },
    { href: '/blog', label: 'Data reports' },
    ...(identity ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
  ]

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[60] bg-accent px-4 py-3 font-bold text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-border-subtle bg-bg">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-6">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-bold no-underline hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/search" aria-label="Search the site" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
              <SearchIcon />
            </Link>
            <ThemeToggle />
            <div className="hidden items-center gap-2 md:flex">
              {identity ? (
                <SignOutForm action={signOutAction}>
                  <Button type="submit" variant="secondary" size="sm">
                    Sign out
                  </Button>
                </SignOutForm>
              ) : (
                <>
                  <Link href="/sign-in" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Sign in
                  </Link>
                  <Link href="/sign-up" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                    Create free profile
                  </Link>
                </>
              )}
            </div>
            <MobileNav links={links}>
              {identity ? (
                <SignOutForm action={signOutAction}>
                  <Button type="submit" variant="secondary" className="w-full">
                    Sign out
                  </Button>
                </SignOutForm>
              ) : (
                <>
                  <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>
                    Create free profile
                  </Link>
                  <Link href="/sign-in" className={buttonVariants({ variant: 'secondary' })}>
                    Sign in
                  </Link>
                </>
              )}
            </MobileNav>
          </div>
        </div>
      </header>
    </>
  )
}
