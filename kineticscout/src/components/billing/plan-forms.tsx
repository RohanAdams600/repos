import { Button } from '@/components/ui/button'
import { PRO_PRICES, yearlySavingsDollars } from '@/lib/billing/plans'

/** Plain HTML forms: checkout works without client JavaScript and is protected by the origin check. */
export function ProCheckoutForms() {
  return (
    <div className="flex flex-col gap-3">
      <form action="/api/billing/checkout" method="post">
        <input type="hidden" name="period" value="monthly" />
        <Button type="submit" className="w-full">
          Go Pro: {PRO_PRICES.monthly.label}
        </Button>
      </form>
      <form action="/api/billing/checkout" method="post">
        <input type="hidden" name="period" value="yearly" />
        <Button type="submit" variant="secondary" className="w-full">
          Go Pro: {PRO_PRICES.yearly.label} (save ${yearlySavingsDollars()})
        </Button>
      </form>
    </div>
  )
}

export function ManageBillingForm({ label = 'Manage or cancel subscription' }: { label?: string }) {
  return (
    <form action="/api/billing/portal" method="post">
      <Button type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  )
}
