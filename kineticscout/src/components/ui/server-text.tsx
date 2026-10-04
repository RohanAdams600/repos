'use client'

import { useServerText } from '@/i18n/server-text-client'

/** Renders a server message in the reader's language. Usable from server and client components. */
export function ServerText({ text }: { text: string }) {
  const tr = useServerText()
  return <>{tr(text)}</>
}
