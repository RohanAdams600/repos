'use client'

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { accountMessages } from '@/i18n/messages/account'
import { base64UrlToBytes, currentPushSubscription, pushSupported } from '@/lib/pwa/device'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function InstallApp() {
  const m = useMessages(accountMessages).device
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const update = () => setInstalled(standalone.matches)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPrompt)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    const first = setTimeout(update, 0)
    standalone.addEventListener('change', update)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      clearTimeout(first)
      standalone.removeEventListener('change', update)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return <p>{m.installed}</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted">{m.install}</p>
      {prompt && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={async () => {
            await prompt.prompt()
            await prompt.userChoice
            setPrompt(null)
          }}
        >
          {m.installButton}
        </Button>
      )}
    </div>
  )
}

function PushNotifications({ vapidPublicKey }: { vapidPublicKey: string }) {
  const m = useMessages(accountMessages).device
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'blocked'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      if (!pushSupported()) return active && setState('unsupported')
      const subscription = await currentPushSubscription().catch(() => null)
      if (!active) return
      setState(subscription ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off')
    })()
    return () => {
      active = false
    }
  }, [])

  async function turnOn() {
    setBusy(true)
    setError(null)
    try {
      // Asked only now, after a deliberate click: never on page load.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) })
      const json = subscription.toJSON()
      const response = await fetch('/api/push/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) })
      if (!response.ok) {
        await subscription.unsubscribe()
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? m.onFailed)
      }
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : m.onFailed)
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      const subscription = await currentPushSubscription()
      if (subscription) {
        await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) })
        await subscription.unsubscribe()
      }
      setState('off')
    } catch {
      setError(m.offFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted">{m.pushIntro}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <div aria-live="polite">
        {state === 'loading' && <Spinner label={m.checking} />}
        {state === 'unsupported' && <p>{m.unsupported}</p>}
        {state === 'blocked' && <p>{m.blocked}</p>}
        {state === 'on' && <p className="font-bold">{m.on}</p>}
        {state === 'off' && <p>{m.off}</p>}
      </div>
      {state === 'off' && (
        <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void turnOn()}>
          {busy ? <Spinner label={m.turningOn} /> : null}
          {m.turnOn}
        </Button>
      )}
      {state === 'on' && (
        <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void turnOff()}>
          {busy ? <Spinner label={m.turningOff} /> : null}
          {m.turnOff}
        </Button>
      )}
    </div>
  )
}

export function DeviceSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const m = useMessages(accountMessages).device
  return (
    <div className="flex flex-col gap-6">
      <InstallApp />
      {vapidPublicKey && <PushNotifications vapidPublicKey={vapidPublicKey} />}
      <p className="text-sm text-fg-muted">{m.offline}</p>
    </div>
  )
}
