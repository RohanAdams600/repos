/**
 * Content-Security-Policy builder. Pure so it can run in the proxy and in unit tests.
 *
 * Scripts: nonce + 'strict-dynamic'. No 'unsafe-inline' for scripts in any environment.
 * Styles: nonce for <style> elements. Inline style attributes (used by chart and progress
 * components for computed widths) are allowed through style-src-attr only.
 */

export type CspOptions = {
  nonce: string
  isDev: boolean
  /** Origins the browser may PUT uploads to and stream media from (signed storage URLs). */
  storageOrigins?: string[]
  /** Add upgrade-insecure-requests (only meaningful when the site itself is served over https). */
  upgradeInsecureRequests?: boolean
}

export const STRIPE_REDIRECT_ORIGINS = ['https://checkout.stripe.com', 'https://billing.stripe.com']

export function buildCsp({ nonce, isDev, storageOrigins = [], upgradeInsecureRequests = !isDev }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) {
    throw new Error('CSP nonce must be at least 16 base64 characters')
  }
  const storage = storageOrigins.join(' ')
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    'style-src': `'self' 'nonce-${nonce}'`,
    'style-src-attr': "'unsafe-inline'",
    'img-src': "'self' blob: data:",
    'font-src': "'self'",
    'media-src': `'self' blob: ${storage}`.trim(),
    'connect-src': `'self' ${storage}${isDev ? ' ws: wss:' : ''}`.trim(),
    'worker-src': "'self' blob:",
    'frame-src': "'none'",
    'object-src': "'none'",
    'base-uri': "'self'",
    // Chrome applies form-action to redirects that follow a form POST, so the Stripe
    // Checkout and Billing Portal hosts must be listed for the billing forms to work.
    'form-action': `'self' ${STRIPE_REDIRECT_ORIGINS.join(' ')}`,
    'frame-ancestors': "'none'",
    'manifest-src': "'self'",
  }
  const parts = Object.entries(directives).map(([name, value]) => `${name} ${value}`)
  if (upgradeInsecureRequests) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

/** 128 bits of randomness, base64 encoded. Works in Node and Web Crypto runtimes. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
