import type { Faq } from '@/lib/content/faq'

/** Expandable FAQs built on <details>: keyboard and screen reader support come from the browser. */
export function FaqList({ faqs, headingLevel = 'h3' }: { faqs: readonly Faq[]; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <div className="flex flex-col border-t-2 border-border-subtle">
      {faqs.map((faq) => (
        <details key={faq.id} id={faq.id} className="group scroll-mt-24 border-b-2 border-border-subtle">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 hover:underline [&::-webkit-details-marker]:hidden">
            <Heading className="text-lg font-bold">{faq.question}</Heading>
            <span aria-hidden="true" className="tabular shrink-0 text-xl text-accent-text group-open:hidden">
              +
            </span>
            <span aria-hidden="true" className="tabular hidden shrink-0 text-xl text-accent-text group-open:inline">
              −
            </span>
          </summary>
          <div className="flex max-w-3xl flex-col gap-3 pb-6 text-fg-muted">
            {faq.answer.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
