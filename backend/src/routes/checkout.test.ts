import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mocks the one shared module both routes/checkout.ts and lib/payments.ts
// import — everything above the DB layer (payments.ts, checkout.ts) runs
// for real, so this is effectively an integration test of the mock-mode
// deposit and subscription funnels end to end.
const dbMock = vi.hoisted(() => ({
  findLeadByEmail: vi.fn(),
  attachStripeCustomerToLead: vi.fn(),
  markDepositPaid: vi.fn(),
  upsertClientFromSubscription: vi.fn().mockResolvedValue("client-1"),
  issueAgentDownloadToken: vi.fn().mockResolvedValue({ token: "tok_test", agent_key: "key_test" }),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");

describe("POST /api/checkout/deposit (PAYMENTS_MODE=mock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the email never joined the waitlist", async () => {
    dbMock.findLeadByEmail.mockResolvedValue(null);

    const res = await request(createApp()).post("/api/checkout/deposit").send({ email: "nobody@acme.com" });

    expect(res.status).toBe(404);
    expect(dbMock.markDepositPaid).not.toHaveBeenCalled();
  });

  it("completes the mock deposit instantly for a known lead and returns a redirect url", async () => {
    dbMock.findLeadByEmail.mockResolvedValue({ id: "lead-1", email: "owner@acme.com" });

    const res = await request(createApp()).post("/api/checkout/deposit").send({ email: "owner@acme.com" });

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(res.body.url).toContain("/waitlist/success");
    expect(dbMock.markDepositPaid).toHaveBeenCalledWith("owner@acme.com");
  });
});

describe("POST /api/checkout/subscription (PAYMENTS_MODE=mock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("activates a Core subscription instantly and returns a redirect url", async () => {
    const res = await request(createApp()).post("/api/checkout/subscription").send({
      email: "owner@acme.com",
      businessName: "Acme Services LLC",
      tier: "core",
    });

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.upsertClientFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "core", mrrCents: 400_000 })
    );
    expect(dbMock.issueAgentDownloadToken).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", tier: "core" })
    );
    expect(res.body.url).toMatch(/session_id=sess_mock_/);
  });

  it("rejects a tier outside the decoy-pricing stack", async () => {
    const res = await request(createApp()).post("/api/checkout/subscription").send({
      email: "owner@acme.com",
      businessName: "Acme Services LLC",
      tier: "enterprise",
    });

    expect(res.status).toBe(400);
    expect(dbMock.upsertClientFromSubscription).not.toHaveBeenCalled();
  });
});
