import { ImageResponse } from 'next/og'

export const alt = 'KineticScout: performance data for high school athletes'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Default social share image, generated at build time from brand tokens (no stock imagery). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#121212', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 32 32">
            <rect x="1" y="14.5" width="30" height="3" fill="#E6FF00" />
            <path d="M8 6l12 10-12 10h6l12-10L14 6H8z" fill="#FFFFFF" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700 }}>KineticScout</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, color: '#E0E0E0', maxWidth: 900 }}>Know your numbers. Show them to the right coaches.</div>
        <div style={{ marginTop: 48, height: 8, width: 240, background: '#E6FF00' }} />
      </div>
    ),
    size,
  )
}
