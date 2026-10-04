'use client'

import { useEffect, useState } from 'react'

/** Reading progress for long pages. Decorative: the scrollbar already conveys position to assistive tech. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <div aria-hidden="true" data-print="hide" className="fixed inset-x-0 top-16 z-40 h-1">
      <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
    </div>
  )
}
