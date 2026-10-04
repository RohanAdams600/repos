import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { directionsUrl } from '@/lib/business-links'
import { organizationJsonLd } from '@/lib/content/organization'
import { TEAM } from '@/lib/content/team'
import { businessDetails } from '@/lib/legal'
import { aboutMessages } from '@/i18n/messages/about'
import { chromeMessages } from '@/i18n/messages/chrome'
import { getLocale, messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = await messages(aboutMessages)
  return { title: m.title, description: m.description, alternates: { canonical: '/about' } }
}

export default async function AboutPage() {
  const locale = await getLocale()
  const m = await messages(aboutMessages)
  const c = await messages(chromeMessages)
  const b = businessDetails()
  const org = organizationJsonLd()
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      {org && <JsonLd data={org} />}
      <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.title }]} />
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold">{m.h1}</h1>
        <p className="text-lg text-fg-muted">{m.lead}</p>
      </div>

      <section aria-labelledby="principles-title" className="flex flex-col gap-4">
        <h2 id="principles-title" className="text-2xl font-bold">
          {m.howWeWork}
        </h2>
        <dl className="grid gap-6 sm:grid-cols-2">
          {m.principles.map(([term, detail]) => (
            <div key={term}>
              <dt className="font-bold">{term}</dt>
              <dd className="mt-1 text-fg-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      {TEAM.length > 0 && (
        <section aria-labelledby="team-title" className="flex flex-col gap-6">
          <h2 id="team-title" className="text-2xl font-bold">
            {m.team}
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" lang={locale === 'en' ? undefined : 'en'}>
            {TEAM.map((member) => (
              <li key={member.name} className="flex flex-col gap-3">
                {member.photo && member.photoAlt && (
                  <Image src={member.photo} alt={member.photoAlt} width={480} height={480} sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw" className="aspect-square w-full object-cover" />
                )}
                <div>
                  <p className="text-lg font-bold">{member.name}</p>
                  <p className="text-sm text-fg-muted">{member.role}</p>
                </div>
                <p className="text-fg-muted">{member.bio}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="find-title" className="flex flex-col gap-3">
        <h2 id="find-title" className="text-2xl font-bold">
          {m.contactTitle}
        </h2>
        {b.complete ? (
          <>
            <address className="not-italic text-fg-muted">
              {b.legalName}
              <br />
              {b.postalAddress}
            </address>
            <a href={directionsUrl(b.postalAddress)} target="_blank" rel="noopener noreferrer">
              {m.directions}
            </a>
          </>
        ) : null}
        <p className="text-fg-muted">
          {m.fastest} <Link href="/contact">{m.contactPage}</Link>. {m.reply}
        </p>
      </section>
    </div>
  )
}
