import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Thank you', robots: { index: false } }

export default async function ContactThanksPage({ searchParams }: PageProps<'/contact/thanks'>) {
  const params = await searchParams
  const privacy = params.topic === 'privacy'
  return (
    <div className="flex max-w-2xl flex-col gap-6 py-8">
      <h1 className="text-4xl font-bold">Thank you. Your message is on its way.</h1>
      <p className="text-lg text-fg-muted">
        A member of our team will reply to the email address you gave within 2 business days.
        {privacy && ' For privacy and deletion requests we confirm within 2 business days and complete the request within 30 days.'}
      </p>
      <p className="text-fg-muted">While you wait, the FAQ answers the questions we hear most often.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/faq" className={buttonVariants({ variant: 'primary' })}>
          Read the FAQ
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          Back to home
        </Link>
      </div>
    </div>
  )
}
