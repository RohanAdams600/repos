import type { Metadata, Viewport } from 'next'
import { Roboto_Mono } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import { BackToTop } from '@/components/layout/back-to-top'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { Analytics } from '@/components/marketing/analytics'
import { ConsentBanner } from '@/components/marketing/consent-banner'
import { ContactDock } from '@/components/marketing/contact-dock'
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker'
import { getAuthIdentity } from '@/lib/auth/session'
import { LocaleProvider } from '@/i18n/client'
import { getLocale } from '@/i18n/server'
import { pick } from '@/i18n/define'
import { homeMessages } from '@/i18n/messages/home'
import { CONSENT_COOKIE, parseConsent } from '@/lib/consent'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import './globals.css'

// Roboto Mono (Apache License 2.0) is downloaded at build time and self-hosted: no request to Google from visitors.
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', display: 'swap' })

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const m = pick(homeMessages, locale)
  return {
    metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
    title: { default: m.title, template: '%s | KineticScout' },
    description: m.description,
    applicationName: 'KineticScout',
    openGraph: { type: 'website', siteName: 'KineticScout', locale: locale === 'es' ? 'es_US' : 'en_US' },
    twitter: { card: 'summary_large_image' },
    formatDetection: { telephone: false },
    appleWebApp: { capable: true, title: 'KineticScout', statusBarStyle: 'black' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value)
  const consent = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value)
  // Read directly: the root layout must render even when optional configuration is absent.
  const gaId = /^G-[A-Z0-9]{4,12}$/.test(process.env.GA_MEASUREMENT_ID ?? '') ? process.env.GA_MEASUREMENT_ID! : null
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const signedIn = Boolean(await getAuthIdentity().catch(() => null))
  const locale = await getLocale()
  return (
    <html lang={locale} data-theme={theme} className={robotoMono.variable}>
      <body className="flex min-h-dvh flex-col">
        <LocaleProvider locale={locale}>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 outline-none sm:pt-12 md:pb-12">
          {children}
        </main>
        <SiteFooter />
        <BackToTop />
        <ContactDock signedIn={signedIn} />
        <ServiceWorkerRegistration enabled={process.env.NODE_ENV === 'production'} />
        {gaId && !consent && <ConsentBanner />}
        {gaId && consent?.analytics && <Analytics measurementId={gaId} nonce={nonce} />}
        </LocaleProvider>
      </body>
    </html>
  )
}
