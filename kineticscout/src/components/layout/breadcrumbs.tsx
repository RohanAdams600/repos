'use client'

import Link from 'next/link'
import { useMessages } from '@/i18n/client'
import { chromeMessages } from '@/i18n/messages/chrome'
import { ChevronRightIcon } from '@/components/icons'

export type Crumb = { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const m = useMessages(chromeMessages)
  return (
    <nav aria-label={m.breadcrumb} className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-fg-muted">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRightIcon size={14} />}
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
