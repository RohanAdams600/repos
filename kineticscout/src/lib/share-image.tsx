import { ImageResponse } from 'next/og'

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

/** Branded social share image for an article or case study (title rendered from data, no stock imagery). */
export function shareImage(title: string, label: string): ImageResponse {
  const text = title.length > 110 ? `${title.slice(0, 107)}...` : title
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#121212', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect x="1" y="14.5" width="30" height="3" fill="#E6FF00" />
            <path d="M8 6l12 10-12 10h6l12-10L14 6H8z" fill="#FFFFFF" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700 }}>KineticScout</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 28, color: '#E6FF00', textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.15 }}>{text}</div>
        </div>
      </div>
    ),
    SHARE_IMAGE_SIZE,
  )
}
