import { ImageResponse } from 'next/og'
import { buildProfileCard, findPublicAthlete } from '@/lib/profile/public'
import { SHARE_IMAGE_SIZE, shareImage } from '@/lib/share-image'

export const alt = 'KineticScout recruiting profile'
export const size = SHARE_IMAGE_SIZE
export const contentType = 'image/png'

/** Link preview when a profile is texted to a coach: name with last initial, class, top numbers. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const athleteId = await findPublicAthlete((await params).slug)
  const card = athleteId ? await buildProfileCard(athleteId, 'public') : null
  if (!card) return shareImage('Recruiting profile', 'KineticScout')
  const top = card.metrics.slice(0, 3)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#121212', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect x="1" y="14.5" width="30" height="3" fill="#E6FF00" />
            <path d="M8 6l12 10-12 10h6l12-10L14 6H8z" fill="#FFFFFF" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700 }}>KineticScout</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>{`${card.firstName} ${card.lastName.charAt(0)}.`}</div>
          <div style={{ fontSize: 32, color: '#E0E0E0' }}>{`Class of ${card.gradYear} · ${card.positionLabel}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {top.map((m) => (
            <div key={m.metricType} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 24px', border: '3px solid #2D2D2D', minWidth: 300 }}>
              <div style={{ fontSize: 24, color: '#E0E0E0' }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontSize: 48, fontWeight: 700 }}>{m.best.toFixed(m.decimals)}</div>
                <div style={{ fontSize: 24, color: '#E0E0E0' }}>{m.unit}</div>
                {m.bestVerified && <div style={{ fontSize: 20, background: '#E6FF00', color: '#121212', padding: '2px 8px', fontWeight: 700 }}>Verified</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    SHARE_IMAGE_SIZE,
  )
}
