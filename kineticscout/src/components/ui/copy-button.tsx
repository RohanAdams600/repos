'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

export function CopyButton({ value, label = 'Copy', onCopied }: { value: string; label?: string; onCopied?: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setState('copied')
            onCopied?.()
          } catch {
            setState('failed')
          }
          setTimeout(() => setState('idle'), 2_000)
        }}
      >
        {state === 'copied' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        {state === 'copied' ? 'Copied' : label}
      </Button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed. Select the text and copy it manually.' : ''}
      </span>
    </span>
  )
}
