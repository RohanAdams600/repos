import type { SVGProps } from 'react'

/**
 * First-party icon set. Stroke icons on a 24px grid, 2px strokes, square caps to match the
 * angular logo. Decorative by default (aria-hidden); pass aria-label and role="img" when an
 * icon carries meaning on its own.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
)
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Icon>
)
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
)
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
  </Icon>
)
export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.1 3.9M6.6 6.6C3.4 8.6 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Icon>
)
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3L1.5 21h21L12 3zM12 10v5M12 17.5v.5" />
  </Icon>
)
export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V3M6 9l6-6 6 6M3 15v6h18v-6" />
  </Icon>
)
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V4M5 11l7-7 7 7" />
  </Icon>
)
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)
export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 8h13v13H8zM16 8V3H3v13h5" />
  </Icon>
)
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4l14 8-14 8V4z" />
  </Icon>
)
export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4v16M17 4v16" />
  </Icon>
)
