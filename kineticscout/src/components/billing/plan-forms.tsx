import { Button } from '@/components/ui/button'
import { defineMessages } from '@/i18n/define'
import { getLocale } from '@/i18n/server'
import { priceLabel, yearlySavingsDollars } from '@/lib/billing/plans'

const planFormMessages = defineMessages(
  { goPro: 'Go Pro', save: (n: number) => `save $${n}`, manage: 'Manage or cancel subscription' },
  { goPro: 'Hazte Pro', save: (n: number) => `ahorras $${n}`, manage: 'Gestionar o cancelar la suscripción' },
)

/** Plain HTML forms: checkout works without client JavaScript and is protected by the origin check. */
export async function ProCheckoutForms() {
  const locale = await getLocale()
  const m = planFormMessages[locale]
  return (
    <div className="flex flex-col gap-3">
      <form action="/api/billing/checkout" method="post">
        <input type="hidden" name="period" value="monthly" />
        <Button type="submit" className="w-full">
          {m.goPro}: {priceLabel('monthly', locale)}
        </Button>
      </form>
      <form action="/api/billing/checkout" method="post">
        <input type="hidden" name="period" value="yearly" />
        <Button type="submit" variant="secondary" className="w-full">
          {m.goPro}: {priceLabel('yearly', locale)} ({m.save(yearlySavingsDollars())})
        </Button>
      </form>
    </div>
  )
}

export async function ManageBillingForm({ label }: { label?: string }) {
  const m = planFormMessages[await getLocale()]
  return (
    <form action="/api/billing/portal" method="post">
      <Button type="submit" variant="secondary">
        {label ?? m.manage}
      </Button>
    </form>
  )
}
