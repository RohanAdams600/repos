import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  markInvoiceSent: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");
const AUTH = { authorization: "Bearer test-dashboard-token" };

describe("POST /api/invoices/:id/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token — the founder-approval gate for boundary #1", async () => {
    const res = await request(createApp()).post("/api/invoices/i1/send");
    expect(res.status).toBe(401);
  });

  it("404s for an unknown invoice", async () => {
    dbMock.getInvoice.mockResolvedValue(null);
    const res = await request(createApp()).post("/api/invoices/i1/send").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("refuses to re-send an invoice that isn't in draft status", async () => {
    dbMock.getInvoice.mockResolvedValue({ id: "i1", status: "sent" });
    const res = await request(createApp()).post("/api/invoices/i1/send").set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("already_processed");
  });

  it("sends a draft invoice (mock mode) and marks it sent", async () => {
    dbMock.getInvoice.mockResolvedValue({
      id: "i1",
      status: "draft",
      client_email: "owner@acme.com",
      line_items: [{ description: "October service", amountCents: 15000 }],
    });

    const res = await request(createApp()).post("/api/invoices/i1/send").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.markInvoiceSent).toHaveBeenCalledWith("i1", null);
  });
});
