import Link from 'next/link'
import { consentMessages } from '@/i18n/messages/consent'
import { messages } from '@/i18n/server'

/** What a parent or guardian agrees to. Shared by the emailed consent page and the Family page so both say the same thing. */
export async function ConsentDisclosures({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as const
  const m = (await messages(consentMessages)).disclosures
  return (
    <div className="flex flex-col gap-6">
      <div>
        <H className="text-xl font-bold">{m.collectTitle}</H>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          {m.collect.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <H className="text-xl font-bold">{m.allowsTitle}</H>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          {m.allows.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <p className="text-fg-muted">
        {m.never} <Link href="/legal/privacy">{m.privacy}</Link>.
      </p>
    </div>
  )
}
