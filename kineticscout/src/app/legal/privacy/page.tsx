import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal-page'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/legal/privacy' } }

export default function PrivacyPage() {
  const b = businessDetails()
  return (
    <LegalPage title="Privacy Policy">
      <p>
        KineticScout is operated by {b.legalName}, {b.postalAddress}. This policy explains what we collect, why, who processes it for us, and
        the choices you have. Contact us at <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a>.
      </p>

      <h2>Who can use KineticScout</h2>
      <p>
        You must be at least 13. We do not knowingly collect personal information from children under 13; if you are under 13 our sign-up
        does not create an account or keep what you typed. If you believe a child under 13 has given us information, email us and we will
        delete it. Athletes aged 13 to 17 can create an account, but it stays private until a parent or guardian consents by email, and only
        an adult may make a purchase.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account: email address, password (stored only as a salted hash by our authentication provider), date of birth, account type, and for athletes under 18 a parent or guardian email address.</li>
        <li>Athlete profile: name, graduating class, sport, position, and optionally height, weight, GPA, high school, batting and throwing side, and X handle.</li>
        <li>Performance data: the metrics you log and the dates they were measured.</li>
        <li>Videos you upload for analysis, the body keypoints detected in them, and the resulting report.</li>
        <li>Colleges you add to your recruiting pipeline and their status.</li>
        <li>Billing: your Stripe customer identifier and subscription status. Card details go directly to Stripe; we never see or store card numbers.</li>
        <li>Security data: request IP addresses are used to prevent abuse and are stored only as keyed hashes, never in readable form. We log security events such as failed sign-ins.</li>
        <li>Contact form: your name, email, topic and message, used only to answer you and deleted after 12 months.</li>
        <li>Analytics, only if you accept analytics cookies: Google Analytics measures visits to our public pages (never your dashboard), and we remember the campaign link (UTM tags) you first arrived from, for up to 30 days, so we know which outreach works.</li>
      </ul>
      <p>We do not collect location, contacts, or advertising identifiers, and we do not use advertising cookies. Analytics stays off unless you choose Accept.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account and the features you use: percentiles, progression charts, video analysis and college matching.</li>
        <li>To publish anonymized statistics. Each published figure describes a group of at least 25 athletes, with one value per athlete, so no individual can be identified.</li>
        <li>To send account emails (confirmations, password resets, guardian consent requests, billing notices).</li>
        <li>To send product news only if you opted in. Every marketing email has an unsubscribe link and supports one-click unsubscribe; you can also change your choice in Settings or from the preferences link in any email. We record when you made each choice.</li>
        <li>To keep the service secure, prevent fraud and comply with law.</li>
      </ul>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Supabase: authentication and database hosting.</li>
        <li>Google Cloud: private video storage and pose detection (Video Intelligence API).</li>
        <li>Stripe: payments and subscriptions.</li>
        <li>Upstash: rate limiting and short-lived caching.</li>
        <li>Resend: delivery of account emails.</li>
        <li>OpenAI: drafting marketing copy and data reports from aggregate statistics only. No personal information is sent.</li>
        <li>Google Analytics: anonymous usage of public pages, only with your consent, with Google signals and ad personalisation turned off.</li>
        <li>Our hosting provider, which serves the website.</li>
      </ul>
      <p>
        These providers act on our instructions under data processing terms. We do not sell personal information and do not share it for
        cross-context behavioral advertising. Your profile is visible to others only if you make it public.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and profile data: until you delete your account. Deletion is carried out 7 days after the request.</li>
        <li>After deletion we keep only an anonymous receipt (a keyed hash, not your id or email) showing that the request was completed.</li>
        <li>Uploaded videos: deleted 12 months after upload. The analysis report is kept with your account.</li>
        <li>Security logs: up to 24 months.</li>
        <li>Contact form messages: 12 months.</li>
        <li>Billing records: as long as tax and accounting law requires, held by Stripe.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        You can access, correct, export or delete your information yourself, without contacting us. See{' '}
        <Link href="/legal/your-data">Your data and privacy choices</Link> for step-by-step instructions.
      </p>
      <ul>
        <li>Access and portability: download everything we hold about your account as a JSON file from Settings.</li>
        <li>Correction: athletes edit their profile from the dashboard; contact us for anything you cannot change yourself.</li>
        <li>
          Deletion: request it from Settings, confirmed with your password. We email you immediately, keep your profile private, and carry
          out the deletion after 7 days, during which you can cancel. If you cannot sign in, email{' '}
          <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> from your account address and we will schedule the same deletion.
        </li>
        <li>
          Parents and guardians of athletes under 18 receive a private link when they consent. With it they can withdraw consent (the profile
          returns to private and purchases and coach outreach stop immediately), stop a subscription from renewing, or have the account
          deleted. A deletion a guardian requests can only be canceled by that guardian. A new link can be requested at any time.
        </li>
      </ul>
      <p>
        Depending on where you live (for example California, Virginia, Colorado or the EU), you may have additional rights, which we honor for
        every user regardless of location.
      </p>

      <h2>Security</h2>
      <p>
        All traffic is encrypted with HTTPS. Session cookies cannot be read by scripts. Videos are stored privately and shared only through
        short-lived signed links. Access to production data is limited to staff who need it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy or our Terms materially we will email account holders before the change takes effect, and ask you to review
        and accept the new version the next time you sign in. Until you accept, you can still download your data or delete your account. See
        also our{' '}
        <Link href="/legal/cookies">Cookie Policy</Link> and <Link href="/legal/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  )
}
