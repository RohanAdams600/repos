import Link from 'next/link'
import { formatPhone, telHref } from '@/lib/business-links'
import { businessDetails } from '@/lib/legal'
import { resetConsentAction } from '@/lib/marketing/actions'
import { LanguageSwitch } from '@/components/layout/language-switch'
import { chromeMessages } from '@/i18n/messages/chrome'
import { messages } from '@/i18n/server'
import { SPANISH_ENABLED } from '@/i18n/config'

export async function SiteFooter() {
  const m = await messages(chromeMessages)
  const business = businessDetails()
  const year = new Date().getUTCFullYear()
  return (
    <footer className="mt-24 border-t-2 border-border-subtle">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <p className="font-bold">KineticScout</p>
          <p className="text-fg-muted">{m.footerTagline}</p>
          {SPANISH_ENABLED && (
            <div className="flex items-center gap-2">
              <span className="text-fg-muted">{m.language}:</span>
              <LanguageSwitch />
            </div>
          )}
        </div>
        <nav aria-label={m.company} className="flex flex-col gap-2">
          <p className="font-bold">{m.company}</p>
          <Link href="/about">{m.about}</Link>
          <Link href="/faq">{m.faq}</Link>
          <Link href="/case-studies">{m.caseStudies}</Link>
          <Link href="/reviews">{m.reviews}</Link>
          <Link href="/events">{m.events}</Link>
          <Link href="/recruiting-calendar">{m.recruitingCalendar}</Link>
          <Link href="/tools/percentile-calculator">{m.calculator}</Link>
          <Link href="/contact">{m.contact}</Link>
        </nav>
        <nav aria-label={m.legal} className="flex flex-col gap-2">
          <p className="font-bold">{m.legal}</p>
          <Link href="/legal/privacy">{m.privacy}</Link>
          <Link href="/legal/terms">{m.terms}</Link>
          <Link href="/legal/refunds">{m.refunds}</Link>
          <Link href="/legal/cookies">{m.cookies}</Link>
          <Link href="/legal/your-data">{m.yourData}</Link>
          {process.env.GA_MEASUREMENT_ID && (
            <form action={resetConsentAction}>
              <button type="submit" className="underline underline-offset-[3px] hover:decoration-2">
                {m.cookieSettings}
              </button>
            </form>
          )}
        </nav>
        <div className="flex flex-col gap-2">
          <p className="font-bold">{m.contact}</p>
          {business.supportEmail.includes('@') && <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>}
          {business.phone && <a href={telHref(business.phone)}>{formatPhone(business.phone)}</a>}
          <p className="text-fg-muted">{m.replyTime}</p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-sm text-fg-muted">
        © {year} {business.legalName}
      </p>
    </footer>
  )
}
