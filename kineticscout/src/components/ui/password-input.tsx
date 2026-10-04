'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { EyeIcon, EyeOffIcon } from '@/components/icons'
import { inputClass } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { useMessages } from '@/i18n/client'
import { uiMessages } from '@/i18n/messages/ui'

/** Password field with a visibility toggle. The toggle is a real button announced with its state. */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const m = useMessages(uiMessages)
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={cn(inputClass, 'pr-14', className)} spellCheck={false} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? m.hidePassword : m.showPassword}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-fg hover:text-accent-text"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}
