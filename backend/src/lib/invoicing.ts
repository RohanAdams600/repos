/**
 * Invoicing via Stripe Invoices — the "invoices" claim. Reuses the same
 * Stripe client as lib/payments.ts, so this is only ever live when
 * PAYMENTS_MODE=live; otherwise every send runs in mock mode (logs
 * only). Drafting a line-item breakdown is Wordsmith's lane (plain
 * content generation); this file only ever fires once a draft is
 * founder-approved — see routes/invoices.ts — matching identity.md
 * boundary #1 ("agents may draft a Stripe action... approval is a hard
 * gate").
 */
import { stripe } from "./stripe.js";
import { logger } from "./logger.js";
import type { InvoiceLineItem } from "./db.js";

export interface SendInvoiceResult {
  mock: boolean;
  stripeInvoiceId: string | null;
}

export async function sendInvoice(input: {
  clientEmail: string;
  lineItems: InvoiceLineItem[];
}): Promise<SendInvoiceResult> {
  if (!stripe) {
    logger.info(
      { clientEmail: input.clientEmail, itemCount: input.lineItems.length },
      "[mock invoicing] would create and send a Stripe invoice — PAYMENTS_MODE is not 'live'"
    );
    return { mock: true, stripeInvoiceId: null };
  }

  const customers = await stripe.customers.list({ email: input.clientEmail, limit: 1 });
  const customer = customers.data[0] ?? (await stripe.customers.create({ email: input.clientEmail }));

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: false,
  });

  for (const item of input.lineItems) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      description: item.description,
      amount: item.amountCents,
      currency: "usd",
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  await stripe.invoices.sendInvoice(finalized.id!);

  return { mock: false, stripeInvoiceId: finalized.id ?? null };
}
