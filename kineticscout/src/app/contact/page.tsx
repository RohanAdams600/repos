import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ContactForm } from '@/components/marketing/contact-form'
import { CopyButton } from '@/components/ui/copy-button'
import { directionsUrl, formatPhone, telHref } from '@/lib/business-links'
import { businessDetails } from '@/lib/legal'
import { chromeMessages } from '@/i18n/messages/chrome'
import { contactMessages } from '@/i18n/messages/contact'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = await messages(contactMessages)
  return { title: m.title, description: m.description, alternates: { canonical: '/contact' } }
}

export default async function ContactPage() {
  const [m, c] = await Promise.all([messages(contactMessages), messages(chromeMessages)])
  const b = businessDetails()
  const hasEmail = b.supportEmail.includes('@')
  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.crumb }]} />
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">{m.lead}</p>
      </div>
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="form-title" className="flex flex-col gap-4">
          <h2 id="form-title" className="text-xl font-bold">
            {m.sendTitle}
          </h2>
          <ContactForm />
        </section>
        <aside aria-labelledby="direct-title" className="flex flex-col gap-6">
          <h2 id="direct-title" className="text-xl font-bold">
            {m.directTitle}
          </h2>
          {hasEmail && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">{m.email}</p>
              <a href={`mailto:${b.supportEmail}`} className="text-lg">
                {b.supportEmail}
              </a>
              <CopyButton value={b.supportEmail} label={m.copyEmail} />
            </div>
          )}
          {b.phone && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">{m.phone}</p>
              <a href={telHref(b.phone)} className="text-lg">
                {formatPhone(b.phone)}
              </a>
            </div>
          )}
          {b.complete && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">{m.mailing}</p>
              <address className="not-italic">
                {b.legalName}
                <br />
                {b.postalAddress}
              </address>
              <a href={directionsUrl(b.postalAddress)} target="_blank" rel="noopener noreferrer">
                {m.directions}
              </a>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-fg-muted">{m.privacyTitle}</p>
            <p className="text-fg-muted">{m.privacyBody}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
