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
      <p>
        If you make your profile public, anyone with the link can see it and download its PDF. You are responsible for keeping it accurate, and
        you can make it private or change the link at any time.
      </p>

      <h2>Verification, comparisons and the recruiting assistant</h2>
      <ul>
        <li>
          A Verified badge means a KineticScout reviewer saw the logged value in the video you sent. It is not an official certification, and we
          remove a badge if we find the evidence was misleading.
        </li>
        <li>Do not send another athlete&apos;s video or a video that does not show the measurement. Doing so can lead to suspension.</li>
        <li>
          Professional reference clips are shown under licence for comparison inside KineticScout only. Do not record, download or share them.
        </li>
        <li>
          Outreach drafts are written by an AI system from your profile and published program facts. Read and edit every draft before sending; you
          are responsible for the messages you send. KineticScout never sends messages to coaches for you.
        </li>
      </ul>

      <h2>Coach accounts</h2>
      <ul>
        <li>
          Coach accounts are for adults who currently work for a college athletic program. You must give your real name and title, use a
          school or program email address, and keep your details current. We check your program&apos;s staff directory before you can search
          athletes or send requests.
        </li>
        <li>
          You are responsible for following the recruiting rules of your governing association, including contact periods. Each request asks
          you to confirm that contact is allowed now; do not send one when it is not.
        </li>
        <li>
          Use athlete information only to recruit for your program. Do not copy profiles into other services, share contact details with
          anyone outside your program&apos;s staff, or use them for marketing. Do not put links or phone numbers in a first message, and do not
          try to contact an athlete who declined or blocked you by other means.
        </li>
        <li>We may suspend a coach account that breaks these rules or that we can no longer verify. Suspension withdraws open requests.</li>
      </ul>

      <h2>Contact requests for athletes</h2>
      <ul>
        <li>
          Verified coaches can find your profile only while it is public, and can only ask to contact you. Nothing is shared unless you accept.
          If you are under 18, a parent or guardian must also approve before the coach receives your email address and theirs.
        </li>
        <li>
          You can decline, block or report any coach. Blocking removes you from that coach&apos;s search results and removes any email address you
          shared from their KineticScout page. Our staff reviews every report.
        </li>
      </ul>

      <h2>What KineticScout does and does not do</h2>
      <p>
        Percentiles, fit scores and video analysis are estimates based on the data available. Video analysis uses a single 2D camera view and
        is not medical, injury or professional coaching advice. Puck and ball tracking is a beta feature: its speed and angle figures are
        estimates from the video (the speed is a lower bound), are not radar or official measurements, and may be missing when the object
        cannot be followed. KineticScout does not guarantee recruiting interest, roster spots, scholarships
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
        You can delete your account at any time from Settings. Deletion is carried out 7 days after your request, and you can cancel until
        then. When it is carried out, any subscription ends immediately and your data is deleted as described in the{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>. A parent or guardian of an athlete under 18 can also request deletion. We may
        suspend accounts that break these terms, and will tell you why unless the law prevents it.
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
