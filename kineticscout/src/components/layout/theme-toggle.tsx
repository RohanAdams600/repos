'use client'

import { MoonIcon, SunIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { THEME_COOKIE } from '@/lib/theme'

function effectiveTheme(): 'light' | 'dark' {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Dark mode toggle. The choice is stored in a first-party preference cookie that the server reads
 * to render the right theme on the first paint (no inline script, no flash). The icon is switched
 * by CSS from the same theme tokens, so it is correct before hydration too.
 */
export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Switch between light and dark mode"
      onClick={() => {
        const next = effectiveTheme() === 'light' ? 'dark' : 'light'
        document.documentElement.dataset.theme = next
        document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      }}
    >
      <span className="theme-icon-dark">
        <SunIcon />
      </span>
      <span className="theme-icon-light">
        <MoonIcon />
      </span>
    </Button>
  )
}
