'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/client'
import { chromeMessages } from '@/i18n/messages/chrome'

export type NavLink = { href: string; label: string }

/** Hamburger navigation for small screens: Escape closes, focus returns to the toggle, choosing a link closes it. */
export function MobileNav({ links, children }: { links: NavLink[]; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const m = useMessages(chromeMessages)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggle.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="md:hidden">
      <Button ref={toggle} variant="ghost" size="icon" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? m.closeMenu : m.openMenu} onClick={() => setOpen((v) => !v)}>
        {open ? <CloseIcon /> : <MenuIcon />}
      </Button>
      {open && (
        <nav id="mobile-menu" aria-label={m.mainNav} className="absolute inset-x-0 top-full border-b-2 border-border-subtle bg-bg px-4 pb-6">
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setOpen(false)} aria-current={pathname === link.href ? 'page' : undefined} className="flex min-h-12 items-center border-b border-border-subtle text-lg font-bold no-underline hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
        </nav>
      )}
    </div>
  )
}
