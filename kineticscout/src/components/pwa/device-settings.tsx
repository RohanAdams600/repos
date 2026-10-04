'use client'

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { base64UrlToBytes, currentPushSubscription, pushSupported } from '@/lib/pwa/device'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function InstallApp() {
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

  if (installed) return <p>KineticScout is installed on this device.</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted">
        Install KineticScout to open it from your home screen in its own window. On iPhone or iPad: tap Share, then Add to Home Screen. On Android:
        open the browser menu, then Install app.
      </p>
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
          Install KineticScout
        </Button>
      )}
    </div>
  )
}

function PushNotifications({ vapidPublicKey }: { vapidPublicKey: string }) {
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
        throw new Error(body?.error ?? 'Notifications could not be turned on.')
      }
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Notifications could not be turned on.')
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
      setError('Notifications could not be turned off. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-muted">
        Notifications only say what kind of update arrived, for example &ldquo;New message&rdquo;. Names, numbers and message text appear only inside the
        app, so nothing private shows on your lock screen. This setting is for this device only.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div aria-live="polite">
        {state === 'loading' && <Spinner label="Checking notifications" />}
        {state === 'unsupported' && <p>This browser does not support notifications. On iPhone or iPad, install KineticScout to your Home Screen first.</p>}
        {state === 'blocked' && <p>Notifications are blocked for this site. You can allow them in your browser&apos;s site settings.</p>}
        {state === 'on' && <p className="font-bold">Notifications are on for this device.</p>}
        {state === 'off' && <p>Notifications are off for this device.</p>}
      </div>
      {state === 'off' && (
        <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void turnOn()}>
          {busy ? <Spinner label="Turning on" /> : null}
          Turn on notifications
        </Button>
      )}
      {state === 'on' && (
        <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void turnOff()}>
          {busy ? <Spinner label="Turning off" /> : null}
          Turn off notifications
        </Button>
      )}
    </div>
  )
}

export function DeviceSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <InstallApp />
      {vapidPublicKey && <PushNotifications vapidPublicKey={vapidPublicKey} />}
      <p className="text-sm text-fg-muted">
        Measurements you log while offline wait on this device and are sent when you reconnect. Signing out removes them, and stops notifications here.
      </p>
    </div>
  )
}
