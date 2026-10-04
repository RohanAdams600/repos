import { headers } from 'next/headers'

/**
 * Structured data (schema.org JSON-LD). The only sanctioned use of raw HTML injection in the app:
 * the payload is server-built JSON with "<" escaped, so it cannot close the script element, and the
 * element carries the request's CSP nonce.
 */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const json = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
  // eslint-disable-next-line react/no-danger
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />
}
