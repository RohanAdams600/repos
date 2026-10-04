'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { useMessages } from '@/i18n/client'
import { chromeMessages } from '@/i18n/messages/chrome'

const HIDDEN_ON = [/^\/dashboard/, /^\/admin/, /^\/onboarding/, /^\/sign-/, /^\/auth\//, /^\/consent\//, /^\/reset-password/, /^\/forgot-password/, /^\/contact/]

/**
 * Floating contact button (desktop) and sticky call-to-action bar (mobile) on public pages.
 * The sign-up CTA is shown only to visitors who are not signed in.
 */
export function ContactDock({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const m = useMessages(chromeMessages)
  if (HIDDEN_ON.some((re) => re.test(pathname))) return null
  return (
    <>
      <Link
        href="/contact"
        data-print="hide"
        className="fixed bottom-4 left-4 z-30 hidden min-h-12 items-center border-2 border-fg bg-bg px-4 font-bold no-underline hover:bg-fg hover:text-bg md:flex"
      >
        {m.contactUs}
      </Link>
      <div data-print="hide" className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t-2 border-border-subtle bg-bg p-3 md:hidden">
        {!signedIn && (
          <Link href="/sign-up" className={buttonVariants({ variant: 'primary', className: 'flex-1' })}>
            {m.createProfile}
          </Link>
        )}
        <Link href="/contact" className={buttonVariants({ variant: 'secondary', className: signedIn ? 'flex-1' : '' })}>
          {m.contact}
        </Link>
      </div>
    </>
  )
}
