import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { businessDetails } from '@/lib/legal'

export const metadata: Metadata = { title: 'Refund Policy', alternates: { canonical: '/legal/refunds' } }

export default function RefundsPage() {
  const b = businessDetails()
  return (
    <LegalPage title="Refund Policy">
      <ul>
        <li>Duplicate charges: if two Pro subscriptions are ever started on one account, the extra subscription is cancelled and refunded automatically.</li>
        <li>New subscriptions: if Pro is not for you, email us within 14 days of your first payment for a full refund.</li>
        <li>Yearly renewals: email us within 14 days of a yearly renewal charge for a full refund.</li>
        <li>Monthly renewals: cancel any time to stop future charges. Pro stays active until the end of the paid month; partial months are not refunded.</li>
      </ul>
      <p>
        To request a refund, email <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> from your account address. Refunds go back to the
        original payment method, usually within 5 to 10 business days depending on your bank. There are no cancellation fees.
      </p>
    </LegalPage>
  )
}
