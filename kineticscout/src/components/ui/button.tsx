import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

/**
 * Buttons change state instantly (no opacity fades). Hover inverts or underlines, so the state
 * change is visible to everyone, including people with low contrast sensitivity.
 */
export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-5 text-base font-bold whitespace-nowrap no-underline transition-none disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface disabled:text-fg-muted',
  {
    variants: {
      variant: {
        primary: 'border-2 border-primary-button-border bg-accent text-on-accent hover:bg-fg hover:text-bg hover:border-fg',
        secondary: 'border-2 border-border-strong bg-transparent text-fg hover:border-fg hover:bg-fg hover:text-bg',
        ghost: 'border-2 border-transparent bg-transparent text-fg underline-offset-4 hover:underline',
        danger: 'border-2 border-danger bg-transparent text-danger hover:bg-danger hover:text-bg',
      },
      size: {
        md: '',
        sm: 'min-h-9 px-3 text-sm',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean; ref?: Ref<HTMLButtonElement> }

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: type ?? 'button' })} {...props} />
}
