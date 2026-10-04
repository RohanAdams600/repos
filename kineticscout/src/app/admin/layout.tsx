import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth/session'
import { TrpcProviders } from '@/trpc/client'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

/** Every admin page and procedure re-checks the ADMIN role; non-admins get a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <TrpcProviders>{children}</TrpcProviders>
}
