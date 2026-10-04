import Link from 'next/link'
import { businessDetails } from '@/lib/legal'

export function SiteFooter() {
  const business = businessDetails()
  const year = new Date().getUTCFullYear()
  return (
    <footer className="mt-24 border-t-2 border-border-subtle">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <p className="font-bold">KineticScout</p>
          <p className="text-fg-muted">Performance data and recruiting tools for high school athletes.</p>
        </div>
        <nav aria-label="Legal" className="flex flex-col gap-2">
          <p className="font-bold">Legal</p>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/refunds">Refund Policy</Link>
          <Link href="/legal/cookies">Cookie Policy</Link>
        </nav>
        <div className="flex flex-col gap-2">
          <p className="font-bold">Contact</p>
          {business.supportEmail.includes('@') && <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>}
          {business.phone && <a href={`tel:${business.phone}`}>{business.phone}</a>}
          <p className="text-fg-muted">We reply to support email within 2 business days.</p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-sm text-fg-muted">
        © {year} {business.legalName}
      </p>
    </footer>
  )
}
