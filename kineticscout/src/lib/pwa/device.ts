/** Browser helpers for the installable app. Client-only. */

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

/**
 * Removes this browser's push subscription, here and on the server, so a shared device stops
 * receiving the account's notifications. Never waits more than two seconds.
 */
export async function releaseDevicePush(): Promise<void> {
  const work = (async () => {
    const subscription = await currentPushSubscription()
    if (!subscription) return
    await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }), keepalive: true }).catch(() => undefined)
    await subscription.unsubscribe().catch(() => undefined)
  })()
  await Promise.race([work.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 2_000))])
}
