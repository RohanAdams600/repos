import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Cookie Policy', alternates: { canonical: '/legal/cookies' } }

const COOKIES = [
  ['sb-…-auth-token', 'Keeps you signed in. Readable only by our server, not by scripts in the page.', 'Session, refreshed while you use the site'],
  ['ks_theme', 'Remembers whether you chose light or dark mode.', '12 months'],
  ['ks_age_screen', 'Set only if an age check fails, to stop the sign-up form being resubmitted with a different date.', '24 hours'],
] as const

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        KineticScout uses only cookies that are strictly necessary to provide the service you ask for. We do not use analytics, advertising or
        social media tracking cookies, so there is nothing to opt in or out of. If that changes, we will ask for your consent before setting
        any non-essential cookie.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Cookies set by KineticScout</caption>
          <thead>
            <tr className="border-b-2 border-border-subtle">
              <th scope="col" className="py-2 pr-4">Name</th>
              <th scope="col" className="py-2 pr-4">Purpose</th>
              <th scope="col" className="py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map(([name, purpose, duration]) => (
              <tr key={name} className="border-b border-border-subtle align-top">
                <td className="tabular py-2 pr-4">{name}</td>
                <td className="py-2 pr-4 text-fg-muted">{purpose}</td>
                <td className="py-2 text-fg-muted">{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        When you pay, Stripe sets its own cookies on checkout.stripe.com to process the payment and prevent fraud. Those are governed by
        Stripe&apos;s privacy policy.
      </p>
    </LegalPage>
  )
}
