import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } }

export default function NotFound() {
  return (
    <div className="flex max-w-2xl flex-col gap-6 py-12">
      <p className="tabular text-6xl font-bold text-accent-text" aria-hidden="true">404</p>
      <h1 className="text-3xl font-bold">We could not find that page</h1>
      <p className="text-fg-muted">The link may be out of date, or the page may have moved. These might help:</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li><Link href="/">Home</Link></li>
        <li><Link href="/pricing">Pricing</Link></li>
        <li><Link href="/blog">Data reports</Link></li>
        <li><Link href="/dashboard">Your dashboard</Link></li>
      </ul>
      <Link href="/" className={buttonVariants({ variant: 'primary' }) + ' self-start'}>Go to the home page</Link>
    </div>
  )
}
