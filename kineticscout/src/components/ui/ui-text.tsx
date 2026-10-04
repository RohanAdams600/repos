'use client'

import { useMessages } from '@/i18n/client'
import { uiMessages } from '@/i18n/messages/ui'

type Key = { [K in keyof typeof uiMessages.en]: (typeof uiMessages.en)[K] extends string ? K : never }[keyof typeof uiMessages.en]

/** A built-in UI word in the reader's language; usable from server components too. */
export function UiText({ k }: { k: Key }) {
  return <>{useMessages(uiMessages)[k]}</>
}
