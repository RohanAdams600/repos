import type { Metadata } from 'next'
import Link from 'next/link'
import { GuardianLinkRequestForm } from '@/components/account/guardian-manage-forms'
import { LegalPage } from '@/components/legal-page'
import { DELETION_GRACE_DAYS } from '@/lib/account/deletion'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Your data and privacy choices',
  description: 'Download your KineticScout data, delete your account, manage email, and parent or guardian controls for athletes under 18.',
  alternates: { canonical: '/legal/your-data' },
}

export default function YourDataPage() {
  const b = businessDetails()
  return (
    <LegalPage title="Your data and privacy choices">
      <p>
        Everything on this page works without contacting us. Every option is available to every account holder, wherever you live. For the
        full details of what we collect and why, read the <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>

      <h2>Download your data</h2>
      <p>
        Signed in, open <Link href="/dashboard/settings">Settings</Link> and choose Download my data. You get a JSON file with your profile,
        every metric you logged, your video analyses, recruiting pipeline, subscription history, email choices and security events. It is
        generated on the spot and never stored.
      </p>

      <h2>Delete your account</h2>
      <p>
        In <Link href="/dashboard/settings">Settings</Link>, choose Delete my account and confirm with your password. We email you right away.
        For {DELETION_GRACE_DAYS} days you can cancel by signing in; during that time your profile is private and any subscription is set not to renew. Then we permanently delete your
        profile, metrics, videos, analyses, recruiting pipeline and login, and cancel any subscription. We keep only an anonymous receipt
        showing the request was completed, and Stripe keeps past invoices as tax law requires.
      </p>
      <p>
        Cannot sign in? Email <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> from the address on the account and we will schedule
        the same deletion for you.
      </p>

      <h2>Email choices</h2>
      <ul>
        <li>Product emails are off unless you turn them on, at sign-up or in Settings.</li>
        <li>Every product email has an unsubscribe link and supports one-click unsubscribe in your mail app. No sign-in needed.</li>
        <li>Account emails (password resets, receipts, consent and deletion notices) are sent while the account exists.</li>
      </ul>

      <h2>Cookies and analytics</h2>
      <p>
        Analytics runs only if you choose Accept in the cookie banner, and only on public pages. When analytics is in use, the Cookie
        settings link in the footer lets you change your choice at any time. See the <Link href="/legal/cookies">Cookie Policy</Link>.
      </p>

      <h2>Parents and guardians</h2>
      <p>
        Athletes aged 13 to 17 need a parent or guardian&apos;s consent before their profile can be public, before they can send coach outreach,
        and before any purchase. After consenting, the parent or guardian receives a private link that lets them, at any time and without an
        account:
      </p>
      <ul>
        <li>withdraw consent, which makes the profile private and blocks purchases and outreach immediately;</li>
        <li>stop a Pro subscription from renewing;</li>
        <li>have the account and all of its data deleted, with the same {DELETION_GRACE_DAYS}-day window, which only they can cancel.</li>
      </ul>
      <p>Lost the link? Enter the email address that received the consent request and we will send a new one.</p>
      <div className="max-w-md">
        <GuardianLinkRequestForm />
      </div>

      <h2>Correcting your information</h2>
      <p>
        Athletes can edit every profile detail from <Link href="/dashboard/profile">Edit profile</Link> in the dashboard. For anything you
        cannot change yourself, such as your email address or date of birth, use the <Link href="/contact">contact page</Link>. We reply
        within 2 business days.
      </p>
    </LegalPage>
  )
}
