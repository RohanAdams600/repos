/*
 * KineticScout service worker: an offline page for navigations, and push notifications.
 * It never caches account pages or API responses, so nothing personal stays on a shared device.
 */
const CACHE = 'ks-shell-v1'
const OFFLINE_URL = '/offline'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Fetched without cookies: the cached offline page carries no account details.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { credentials: 'omit' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.mode !== 'navigate') return
  // Network first, always. The cached page is shown only when the network cannot be reached.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
})

function safePath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard/notifications'
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' ? data.title : 'KineticScout'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url: safePath(data.url) },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          return client.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target.href) : undefined))
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
