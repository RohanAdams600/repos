'use client'

/** Last-resort boundary when the root layout itself fails. Inline styles only: globals.css may not have loaded. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#121212', color: '#ffffff', fontFamily: 'Helvetica Neue, Helvetica, Arial, system-ui, sans-serif', padding: 32 }}>
        <h1 style={{ fontSize: 28 }}>KineticScout is temporarily unavailable</h1>
        <p style={{ color: '#e0e0e0' }}>Please try again in a moment.</p>
        {error.digest && <p style={{ color: '#e0e0e0', fontFamily: 'monospace' }}>Reference: {error.digest}</p>}
        <button type="button" onClick={reset} style={{ marginTop: 16, minHeight: 44, padding: '0 20px', background: '#e6ff00', color: '#121212', border: 0, fontWeight: 700 }}>
          Try again
        </button>
      </body>
    </html>
  )
}
