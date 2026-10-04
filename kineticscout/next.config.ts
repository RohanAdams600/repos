import type { NextConfig } from 'next'

// HSTS only when the site is actually served over https (never on http://localhost).
const servesHttps = process.env.NODE_ENV === 'production' && (process.env.APP_URL ?? '').startsWith('https://')

// Headers that do not depend on a per-request nonce. The Content-Security-Policy
// is set per request in src/proxy.ts so that it can carry a fresh nonce.
const staticSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  ...(servesHttps
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Packages with native bindings or dynamic requires stay out of the server bundle.
  serverExternalPackages: ['pino', 'pg', '@google-cloud/storage', '@google-cloud/video-intelligence'],
  images: {
    // No remote image hosts are allowed. All imagery is first-party and served from /public.
    remotePatterns: [],
    formats: ['image/webp'],
    maximumRedirects: 0,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '64kb',
    },
  },
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

export default nextConfig
