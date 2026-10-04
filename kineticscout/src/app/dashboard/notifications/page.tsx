import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { NotificationList } from '@/components/dashboard/notification-list'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  await requireUser('/dashboard/notifications')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]} />
        <h1 className="text-3xl font-bold">Notifications</h1>
      </div>
      <NotificationList />
    </div>
  )
}
