import type { Athlete, MediaItem } from './types'

/**
 * Media comes from licensed providers or links out to official pages. Nothing is scraped or
 * rehosted. A provider that needs a key stays off until one is configured at build time
 * (VITE_GETTY_API_KEY and friends), and even then only returns links and embeddable
 * thumbnails the licence allows.
 */
export interface MediaProvider {
  id: string
  label: string
  kind: 'link-out' | 'licensed-api'
  configured: boolean
  note: string
  search?(a: Athlete): Promise<MediaItem[]>
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}

export const PROVIDERS: MediaProvider[] = [
  {
    id: 'official',
    label: 'Official league and team pages',
    kind: 'link-out',
    configured: true,
    note: 'Opens the official page in a new tab. Nothing is copied into the app.',
  },
  {
    id: 'getty',
    label: 'Getty Images API',
    kind: 'licensed-api',
    configured: Boolean(env.VITE_GETTY_API_KEY),
    note: 'Licensed editorial photos. Needs an API key and an editorial licence for display.',
    async search(a) {
      const res = await fetch(`https://api.gettyimages.com/v3/search/images/editorial?phrase=${encodeURIComponent(a.name)}&sort_order=newest&page_size=12`, {
        headers: { 'Api-Key': env.VITE_GETTY_API_KEY ?? '' },
      })
      if (!res.ok) return []
      const json = (await res.json()) as { images?: { id: string; title: string; date_created: string; display_sizes?: { uri: string }[] }[] }
      return (json.images ?? []).map((img) => ({
        id: `getty-${img.id}`,
        kind: 'photo' as const,
        title: img.title,
        source: 'Getty Images',
        url: `https://www.gettyimages.com/detail/${img.id}`,
        date: img.date_created.slice(0, 10),
        dateKind: 'published' as const,
        delivery: 'licensed-api' as const,
        tags: ['photo'],
      }))
    },
  },
  {
    id: 'ap',
    label: 'AP Images',
    kind: 'licensed-api',
    configured: Boolean(env.VITE_AP_API_KEY),
    note: 'Licensed news photos and video. Needs an AP Media API key.',
  },
  {
    id: 'league',
    label: 'League media partner feeds',
    kind: 'licensed-api',
    configured: Boolean(env.VITE_LEAGUE_MEDIA_KEY),
    note: 'Highlight clips under a league media agreement. Needs a partner key.',
  },
]
