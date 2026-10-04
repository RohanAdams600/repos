import type { Metadata } from 'next'
import Link from 'next/link'
import { CancelDeletionForm, DeleteAccountForm } from '@/components/account/delete-account-form'
import { MarketingPreferenceForm } from '@/components/account/marketing-preference-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { DeviceSettings } from '@/components/pwa/device-settings'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { activeDeletionRequest, DELETION_GRACE_DAYS } from '@/lib/account/deletion'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { isLocale, SPANISH_ENABLED } from '@/i18n/config'
import { LanguageSetting } from '@/components/account/language-setting'
import { vapidConfig } from '@/lib/push/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(accountMessages)).settings.title }
}

export default async function SettingsPage({ searchParams }: PageProps<'/dashboard/settings'>) {
  const user = await requireUser('/dashboard/settings')
  const params = await searchParams
  const locale = await getLocale()
  const t = pick(accountMessages, locale)
  const m = t.settings
  const formatDate = (date: Date) => formatDay(date, locale)
  const key = [params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? m.notices[key] : undefined

  const [account, deletion] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        createdAt: true,
        locale: true,
        marketingEmailOptIn: true,
        marketingOptInUpdatedAt: true,
        termsAcceptedAt: true,
        guardianConsent: { select: { guardianEmail: true, status: true, grantedAt: true } },
      },
    }),
    activeDeletionRequest(user.id),
  ])

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.dashboard, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="account-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="account-title" className="text-xl font-bold">
          {m.account}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-fg-muted">{m.email}</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-fg-muted">{m.type}</dt>
          <dd>{m.role[user.role]}</dd>
          <dt className="text-fg-muted">{m.since}</dt>
          <dd>{formatDate(account.createdAt)}</dd>
          {account.termsAcceptedAt && (
            <>
              <dt className="text-fg-muted">{m.terms}</dt>
              <dd>{formatDate(account.termsAcceptedAt)}</dd>
            </>
          )}
        </dl>
        {user.role === 'ATHLETE' && user.hasAthleteProfile && (
          <p>
            <Link href="/dashboard/profile">{m.editProfile}</Link>
          </p>
        )}
        <p className="text-sm text-fg-muted">
          {m.changePassword} <Link href="/forgot-password">{m.reset}</Link>
          {m.changeEmail} <Link href="/contact">{m.contactPage}</Link>.
        </p>
      </section>

      {SPANISH_ENABLED && (
        <section aria-labelledby="language-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
          <h2 id="language-title" className="text-xl font-bold">
            {m.language}
          </h2>
          <p className="text-fg-muted">{m.languageIntro}</p>
          <LanguageSetting current={isLocale(account.locale) ? account.locale : locale} label={m.languageLabel} save={m.languageSave} />
        </section>
      )}

      <section aria-labelledby="email-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="email-title" className="text-xl font-bold">
          {m.emailTitle}
        </h2>
        <p className="text-fg-muted">{m.emailIntro}</p>
        <MarketingPreferenceForm mode="settings" optedIn={account.marketingEmailOptIn} disabled={deletion !== null} />
        {account.marketingOptInUpdatedAt && <p className="text-sm text-fg-muted">{m.lastChanged(formatDate(account.marketingOptInUpdatedAt))}</p>}
      </section>

      {account.guardianConsent && (
        <section aria-labelledby="guardian-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
          <h2 id="guardian-title" className="text-xl font-bold">
            {m.guardian}
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-muted">{m.onFile}</dt>
            <dd className="break-all">{account.guardianConsent.guardianEmail}</dd>
            <dt className="text-fg-muted">{m.status}</dt>
            <dd>{m.consent[account.guardianConsent.status]}</dd>
          </dl>
          <p className="text-sm text-fg-muted">
            {m.guardianNote} <Link href="/legal/your-data">{m.yourData}</Link>
            {m.page}
          </p>
        </section>
      )}

      <section aria-labelledby="device-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="device-title" className="text-xl font-bold">
          {m.device}
        </h2>
        <DeviceSettings vapidPublicKey={vapidConfig()?.publicKey ?? null} />
      </section>

      <section aria-labelledby="data-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="data-title" className="text-xl font-bold">
          {m.dataTitle}
        </h2>
        <p className="text-fg-muted">{m.dataIntro}</p>
        <form method="post" action="/api/account/export">
          <Button type="submit" variant="secondary">
            {m.download}
          </Button>
        </form>
      </section>

      <section aria-labelledby="delete-title" className="flex flex-col gap-4 border-2 border-danger p-6">
        <h2 id="delete-title" className="text-xl font-bold">
          {m.deleteTitle}
        </h2>
        {deletion ? (
          <>
            <p>
              {m.deletionOn} <strong>{formatDate(deletion.scheduledFor)}</strong>
              {m.deletionTail}
            </p>
            {deletion.requestedBy === 'GUARDIAN' ? (
              <p className="text-fg-muted">{m.byGuardian}</p>
            ) : (
              <CancelDeletionForm />
            )}
          </>
        ) : (
          <>
            <p className="text-fg-muted">{m.deleteIntro(DELETION_GRACE_DAYS)}</p>
            <DeleteAccountForm />
          </>
        )}
      </section>
    </div>
  )
}
