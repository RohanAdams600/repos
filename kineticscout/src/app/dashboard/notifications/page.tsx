import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { NotificationList } from '@/components/dashboard/notification-list'
import { accountMessages } from '@/i18n/messages/account'
import { messages } from '@/i18n/server'
import { requireUser } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(accountMessages)).notifications.title }
}

export default async function NotificationsPage() {
  await requireUser('/dashboard/notifications')
  const t = await messages(accountMessages)
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.dashboard, href: '/dashboard' }, { label: t.notifications.title }]} />
        <h1 className="text-3xl font-bold">{t.notifications.title}</h1>
      </div>
      <NotificationList />
    </div>
  )
}
