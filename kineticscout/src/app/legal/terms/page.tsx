import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal-page'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = { title: 'Terms of Service', alternates: { canonical: '/legal/terms' } }

export default function TermsPage() {
  const b = businessDetails()
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and {b.legalName} (&quot;KineticScout&quot;, &quot;we&quot;). By creating an account you accept
        them. If you are under 18, your parent or guardian must also agree to them before you can make a purchase or make your profile public.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 and give accurate information, including your date of birth.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>One person per account. Coach accounts are for adults.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Log only numbers that were actually measured. Do not enter false or misleading metrics.</li>
        <li>Upload only videos you have the right to share, showing yourself.</li>
        <li>Do not scrape, overload, probe or bypass the security of the service.</li>
        <li>Do not impersonate anyone or use the service to harass anyone.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own the metrics and videos you provide. You give us a limited license to store and process them to run the service, and to include
        your values in anonymized statistics of at least 25 athletes. You can delete your content at any time.
      </p>

      <h2>What KineticScout does and does not do</h2>
      <p>
        Percentiles, fit scores and video analysis are estimates based on the data available. Video analysis uses a single 2D camera view and
        is not medical, injury or professional coaching advice. KineticScout does not guarantee recruiting interest, roster spots, scholarships
        or offers, and is not affiliated with any college, league or governing body.
      </p>

      <h2>Subscriptions and payment</h2>
      <ul>
        <li>Pro is billed in advance, monthly or yearly, at the price shown when you subscribe, and renews automatically until cancelled.</li>
        <li>You can cancel at any time from the billing page in one step. Pro stays active until the end of the period you paid for.</li>
        <li>We will email you at least 30 days before any price increase applies to your subscription.</li>
        <li>Refunds follow our <Link href="/legal/refunds">Refund Policy</Link>.</li>
      </ul>

      <h2>Ending your account</h2>
      <p>
        You can close your account at any time. We may suspend accounts that break these terms, and will tell you why unless the law prevents
        it.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        The service is provided as is. To the extent the law allows, we are not liable for indirect or consequential losses, and our total
        liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under
        consumer protection law that cannot be waived.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of {b.governingLaw}, without affecting mandatory consumer rights where you live.</p>

      <h2>Contact</h2>
      <p>
        {b.legalName}, {b.postalAddress}. Email <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a>.
      </p>
    </LegalPage>
  )
}
