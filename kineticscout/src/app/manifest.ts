import type { MetadataRoute } from 'next'

/** Installable app: opens on the dashboard in its own window, in the brand's onyx. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'KineticScout',
    short_name: 'KineticScout',
    description: 'Log measurements, analyze video and manage recruiting from your phone.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#121212',
    theme_color: '#121212',
    categories: ['sports', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Log a measurement', url: '/dashboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Messages', url: '/dashboard/messages', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
