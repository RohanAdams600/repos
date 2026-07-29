import { describe, expect, it } from "vitest";
import { sendInvoice } from "./invoicing.js";

// PAYMENTS_MODE=mock in test/setup.ts, so lib/stripe.js's `stripe` client
// is null and this always takes the mock branch.
describe("invoicing (mock mode — PAYMENTS_MODE=mock)", () => {
  it("logs instead of creating a real Stripe invoice", async () => {
    const result = await sendInvoice({
      clientEmail: "owner@acme.com",
      lineItems: [{ description: "October service", amountCents: 15000 }],
    });
    expect(result.mock).toBe(true);
    expect(result.stripeInvoiceId).toBeNull();
  });
});
