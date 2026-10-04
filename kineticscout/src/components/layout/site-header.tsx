import Link from 'next/link'
import { SignOutForm } from '@/components/pwa/sign-out-form'
import { Logo } from '@/components/brand/logo'
import { SearchIcon } from '@/components/icons'
import { MobileNav, type NavLink } from '@/components/layout/mobile-nav'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button, buttonVariants } from '@/components/ui/button'
import { signOutAction } from '@/lib/auth/actions'
import { getAuthIdentity } from '@/lib/auth/session'
import { LanguageSwitch } from '@/components/layout/language-switch'
import { chromeMessages } from '@/i18n/messages/chrome'
import { messages } from '@/i18n/server'

/** Sticky header with skip link, primary navigation, theme toggle and the account entry point. */
export async function SiteHeader() {
  // The header must render even if the auth provider is unreachable; the dashboard enforces auth itself.
  const identity = await getAuthIdentity().catch(() => null)
  const m = await messages(chromeMessages)
  const links: NavLink[] = [
    { href: '/pricing', label: m.pricing },
    { href: '/events', label: m.events },
    { href: '/faq', label: m.faq },
    { href: '/blog', label: m.dataReports },
    ...(identity ? [{ href: '/dashboard', label: m.dashboard }] : []),
  ]

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[60] bg-accent px-4 py-3 font-bold text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {m.skipToContent}
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-border-subtle bg-bg">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo label={m.home} />
          <nav aria-label={m.mainNav} className="hidden md:block">
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
            <Link href="/search" aria-label={m.search} className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
              <SearchIcon />
            </Link>
            <ThemeToggle />
            <div className="hidden md:block">
              <LanguageSwitch />
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {identity ? (
                <SignOutForm action={signOutAction}>
                  <Button type="submit" variant="secondary" size="sm">
                    {m.signOut}
                  </Button>
                </SignOutForm>
              ) : (
                <>
                  <Link href="/sign-in" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    {m.signIn}
                  </Link>
                  <Link href="/sign-up" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                    {m.createProfile}
                  </Link>
                </>
              )}
            </div>
            <MobileNav links={links}>
              <LanguageSwitch className="flex min-h-12 items-center text-lg font-bold underline underline-offset-[3px]" />
              {identity ? (
                <SignOutForm action={signOutAction}>
                  <Button type="submit" variant="secondary" className="w-full">
                    {m.signOut}
                  </Button>
                </SignOutForm>
              ) : (
                <>
                  <Link href="/sign-up" className={buttonVariants({ variant: 'primary' })}>
                    {m.createProfile}
                  </Link>
                  <Link href="/sign-in" className={buttonVariants({ variant: 'secondary' })}>
                    {m.signIn}
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
