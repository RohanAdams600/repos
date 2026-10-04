import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { directionsUrl } from '@/lib/business-links'
import { organizationJsonLd } from '@/lib/content/organization'
import { TEAM } from '@/lib/content/team'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'About',
  description: 'Who runs KineticScout, what we believe about athlete data, and how to reach us.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  const b = businessDetails()
  const org = organizationJsonLd()
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      {org && <JsonLd data={org} />}
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold">About KineticScout</h1>
        <p className="text-lg text-fg-muted">
          KineticScout gives high school athletes and their families a clear picture of their measurables: where they stand in their class, what
          is holding their mechanics back, and which programs recruit athletes with numbers like theirs.
        </p>
      </div>

      <section aria-labelledby="principles-title" className="flex flex-col gap-4">
        <h2 id="principles-title" className="text-2xl font-bold">
          How we work
        </h2>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="font-bold">Your data is yours</dt>
            <dd className="mt-1 text-fg-muted">Profiles start private. We never sell personal information or use it for advertising.</dd>
          </div>
          <div>
            <dt className="font-bold">Minors are protected by default</dt>
            <dd className="mt-1 text-fg-muted">No accounts under 13. Teens need a parent or guardian to approve anything public or paid.</dd>
          </div>
          <div>
            <dt className="font-bold">Numbers you can trace</dt>
            <dd className="mt-1 text-fg-muted">Every published statistic comes from anonymized groups of at least 25 athletes, with the method shown.</dd>
          </div>
          <div>
            <dt className="font-bold">No promises we cannot keep</dt>
            <dd className="mt-1 text-fg-muted">We show how measurables compare. We never claim to guarantee a roster spot, offer or scholarship.</dd>
          </div>
        </dl>
      </section>

      {TEAM.length > 0 && (
        <section aria-labelledby="team-title" className="flex flex-col gap-6">
          <h2 id="team-title" className="text-2xl font-bold">
            The team
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
          Contact and location
        </h2>
        {b.complete ? (
          <>
            <address className="not-italic text-fg-muted">
              {b.legalName}
              <br />
              {b.postalAddress}
            </address>
            <a href={directionsUrl(b.postalAddress)} target="_blank" rel="noopener noreferrer">
              Get directions (opens Google Maps)
            </a>
          </>
        ) : null}
        <p className="text-fg-muted">
          The fastest way to reach us is the <Link href="/contact">contact page</Link>. We reply within 2 business days.
        </p>
      </section>
    </div>
  )
}
