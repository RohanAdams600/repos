import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  attachStripeCustomerToLead: vi.fn(),
  markDepositPaid: vi.fn(),
  upsertClientFromSubscription: vi.fn(),
}));

vi.mock("./db.js", () => dbMock);

// PAYMENTS_MODE=mock is set in test/setup.ts, so no real Stripe client
// exists — these tests exercise the entire mock-mode code path, which is
// what the live demo funnel runs on until Stripe is configured.
const { createDepositCheckout, createSubscriptionCheckout } = await import("./payments.js");

describe("payments (mock mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createDepositCheckout marks the deposit paid and returns a mock success URL", async () => {
    const result = await createDepositCheckout({ email: "founder@acme.com", leadId: "lead-1" });

    expect(dbMock.attachStripeCustomerToLead).toHaveBeenCalledWith(
      "founder@acme.com",
      expect.stringMatching(/^cus_mock_/)
    );
    expect(dbMock.markDepositPaid).toHaveBeenCalledWith("founder@acme.com");
    expect(result.mock).toBe(true);
    expect(result.url).toContain("mock=1");
    expect(result.url).toContain("kind=deposit");
  });

  it("createSubscriptionCheckout activates the client at the tier's MRR and returns a mock URL", async () => {
    const result = await createSubscriptionCheckout({
      email: "founder@acme.com",
      businessName: "Acme Services LLC",
      tier: "core",
    });

    expect(dbMock.upsertClientFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        leadEmail: "founder@acme.com",
        businessName: "Acme Services LLC",
        tier: "core",
        mrrCents: 100_000,
      })
    );
    expect(result.mock).toBe(true);
    expect(result.url).toContain("tier=core");
  });

  it("generates distinct mock customer/subscription ids per call", async () => {
    await createSubscriptionCheckout({ email: "a@acme.com", businessName: "A", tier: "starter" });
    await createSubscriptionCheckout({ email: "b@acme.com", businessName: "B", tier: "starter" });

    const [firstCall, secondCall] = dbMock.upsertClientFromSubscription.mock.calls;
    expect(firstCall[0].stripeCustomerId).not.toBe(secondCall[0].stripeCustomerId);
    expect(firstCall[0].stripeSubscriptionId).not.toBe(secondCall[0].stripeSubscriptionId);
  });
});
