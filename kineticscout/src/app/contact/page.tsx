import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ContactForm } from '@/components/marketing/contact-form'
import { CopyButton } from '@/components/ui/copy-button'
import { directionsUrl, formatPhone, telHref } from '@/lib/business-links'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Questions about your account, billing, privacy or the data? Email, call or send us a message. We reply within 2 business days.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  const b = businessDetails()
  const hasEmail = b.supportEmail.includes('@')
  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-4xl font-bold">Contact us</h1>
        <p className="text-lg text-fg-muted">A person reads every message. We reply within 2 business days, Monday to Friday.</p>
      </div>
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="form-title" className="flex flex-col gap-4">
          <h2 id="form-title" className="text-xl font-bold">
            Send a message
          </h2>
          <ContactForm />
        </section>
        <aside aria-labelledby="direct-title" className="flex flex-col gap-6">
          <h2 id="direct-title" className="text-xl font-bold">
            Reach us directly
          </h2>
          {hasEmail && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">Email</p>
              <a href={`mailto:${b.supportEmail}`} className="text-lg">
                {b.supportEmail}
              </a>
              <CopyButton value={b.supportEmail} label="Copy email" />
            </div>
          )}
          {b.phone && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">Phone</p>
              <a href={telHref(b.phone)} className="text-lg">
                {formatPhone(b.phone)}
              </a>
            </div>
          )}
          {b.complete && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-fg-muted">Mailing address</p>
              <address className="not-italic">
                {b.legalName}
                <br />
                {b.postalAddress}
              </address>
              <a href={directionsUrl(b.postalAddress)} target="_blank" rel="noopener noreferrer">
                Get directions (opens Google Maps)
              </a>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-fg-muted">Privacy and data requests</p>
            <p className="text-fg-muted">Choose &ldquo;Privacy or data deletion request&rdquo; in the form and send it from your account email. We confirm within 2 business days and finish within 30 days.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
