import Link from 'next/link'

/** What a parent or guardian agrees to. Shared by the emailed consent page and the Family page so both say the same thing. */
export function ConsentDisclosures({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as const
  return (
    <div className="flex flex-col gap-6">
      <div>
        <H className="text-xl font-bold">What we collect</H>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          <li>Name, graduation year, position, and optionally height, weight, GPA, high school and X handle.</li>
          <li>Performance numbers they log, swing or pitch videos they upload for analysis, and clips they send to have a measurement verified (reviewed privately by our staff).</li>
          <li>Email address and date of birth, used for the account and to apply age rules.</li>
        </ul>
      </div>
      <div>
        <H className="text-xl font-bold">What your consent allows</H>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          <li>Making their profile public, if they choose to, so college coaches can view it.</li>
          <li>Drafting outreach emails to college coaches for them to send (Pro). Drafts are written by OpenAI from their profile facts; their email, date of birth and videos are never sent.</li>
          <li>Purchasing a Pro subscription. Purchases must be completed by you, the adult.</li>
        </ul>
      </div>
      <p className="text-fg-muted">
        We never sell personal information or use it for third-party advertising. Read the full <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
    </div>
  )
}
