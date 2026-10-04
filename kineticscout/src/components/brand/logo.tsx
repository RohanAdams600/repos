import Link from 'next/link'

/**
 * KineticScout mark: a chevron-shaped projectile slicing through a horizontal axis.
 * Monotone (currentColor) with the axis cut-through in Neon Volt.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* In light mode the volt axis gets an onyx outline so it stays visible on white. */}
      <rect x="1" y="14.5" width="30" height="3" fill="var(--accent)" stroke="var(--accent-outline)" strokeWidth="1" />
      <path d="M8 6l12 10-12 10h6l12-10L14 6H8z" fill="currentColor" />
    </svg>
  )
}

export function Logo({ label = 'KineticScout home' }: { label?: string }) {
  return (
    <Link href="/" aria-label={label} className="flex min-h-11 items-center gap-2 no-underline">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">KineticScout</span>
    </Link>
  )
}
