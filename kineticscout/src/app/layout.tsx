import type { Metadata, Viewport } from 'next'
import { Roboto_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { BackToTop } from '@/components/layout/back-to-top'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import './globals.css'

// Roboto Mono (Apache License 2.0) is downloaded at build time and self-hosted: no request to Google from visitors.
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'KineticScout: performance data for high school athletes', template: '%s | KineticScout' },
  description:
    'Log your exit velocity, pitch velocity and sprint times, see where you rank in your graduating class, and find college programs that fit your numbers.',
  applicationName: 'KineticScout',
  openGraph: { type: 'website', siteName: 'KineticScout', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
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
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="en" data-theme={theme} className={robotoMono.variable}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:py-12">
          {children}
        </main>
        <SiteFooter />
        <BackToTop />
      </body>
    </html>
  )
}
