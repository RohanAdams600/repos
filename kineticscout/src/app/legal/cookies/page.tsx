import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Cookie Policy', alternates: { canonical: '/legal/cookies' } }

const COOKIES = [
  ['sb-…-auth-token', 'Keeps you signed in. Readable only by our server, not by scripts in the page.', 'Session, refreshed while you use the site'],
  ['ks_theme', 'Remembers whether you chose light or dark mode.', '12 months'],
  ['ks_age_screen', 'Set only if an age check fails, to stop the sign-up form being resubmitted with a different date.', '24 hours'],
  ['ks_consent', 'Remembers whether you accepted or rejected analytics, so we do not ask on every page.', '12 months'],
] as const

const OPTIONAL_COOKIES = [
  ['_ga, _ga_<id>', 'Google Analytics: distinguishes visits to our public pages so we can count them. Set by Google on our domain.', '13 months'],
  ['ks_utm', 'Remembers the campaign link (UTM tags) you first arrived from, so a sign-up can be credited to the right campaign.', '30 days'],
] as const

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        KineticScout sets cookies that are strictly necessary to run the service. Analytics cookies are optional: they are set only if you choose
        Accept in the cookie banner, only on our public pages, and never in your dashboard. You can change your choice at any time with Cookie
        settings in the footer. We do not use advertising or social media tracking cookies.
      </p>
      <h2>Strictly necessary</h2>
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
      <h2>Storage on your device</h2>
      <p>The installable app also uses browser storage that is not a cookie. None of it is used for tracking.</p>
      <ul>
        <li>
          <span className="tabular">ks_outbox_v1</span> (local storage): measurements you log while offline, kept until they are sent, for at most 30
          days, and deleted when you sign out.
        </li>
        <li>
          <span className="tabular">ks-shell-v1</span> (app cache): the offline page and app icons, so the app can tell you it is offline. It contains
          nothing about your account and is replaced when the app updates.
        </li>
        <li>Notification registration: only if you turn on notifications for a device in Settings. Removed when you turn them off or sign out.</li>
      </ul>
      <h2>Optional, only if you accept analytics</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Optional analytics cookies</caption>
          <thead>
            <tr className="border-b-2 border-border-subtle">
              <th scope="col" className="py-2 pr-4">Name</th>
              <th scope="col" className="py-2 pr-4">Purpose</th>
              <th scope="col" className="py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {OPTIONAL_COOKIES.map(([name, purpose, duration]) => (
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
