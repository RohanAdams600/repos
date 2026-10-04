import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { contactMessages } from '@/i18n/messages/contact'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(contactMessages)).thanks.title, robots: { index: false } }
}

export default async function ContactThanksPage({ searchParams }: PageProps<'/contact/thanks'>) {
  const params = await searchParams
  const m = (await messages(contactMessages)).thanks
  const privacy = params.topic === 'privacy'
  return (
    <div className="flex max-w-2xl flex-col gap-6 py-8">
      <h1 className="text-4xl font-bold">{m.h1}</h1>
      <p className="text-lg text-fg-muted">
        {m.reply}
        {privacy && ` ${m.privacy}`}
      </p>
      <p className="text-fg-muted">{m.faq}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/faq" className={buttonVariants({ variant: 'primary' })}>
          {m.readFaq}
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          {m.home}
        </Link>
      </div>
    </div>
  )
}
