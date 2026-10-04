'use client'

import { useEffect, useState } from 'react'
import { ArrowUpIcon } from '@/components/icons'
import { useMessages } from '@/i18n/client'
import { chromeMessages } from '@/i18n/messages/chrome'

/** Appears after scrolling one screen; moves focus to the top of the document for keyboard users. */
export function BackToTop() {
  const [visible, setVisible] = useState(false)
  const m = useMessages(chromeMessages)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      type="button"
      data-print="hide"
      onClick={() => {
        window.scrollTo({ top: 0 })
        document.getElementById('main')?.focus()
      }}
      aria-label={m.backToTop}
      className="fixed right-4 bottom-20 z-30 md:bottom-4 flex size-12 items-center justify-center border-2 border-primary-button-border bg-accent text-on-accent hover:bg-fg hover:text-bg"
    >
      <ArrowUpIcon />
    </button>
  )
}
