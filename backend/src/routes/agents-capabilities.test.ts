import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Covers the inbox/calendar/invoices/sms endpoints added to agents.ts —
// kept in a separate file from any pre-existing agents route tests to
// keep each file's mock surface small and legible.
const dbMock = vi.hoisted(() => ({
  insertInboxMessageIfNew: vi.fn(),
  listNewInboxMessages: vi.fn(),
  setInboxDraft: vi.fn(),
  insertCalendarProposal: vi.fn(),
  insertInvoiceDraft: vi.fn(),
  listNewSms: vi.fn(),
  setSmsDraft: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");
const AUTH = { authorization: "Bearer test-agents-token" };

describe("POST /api/agents/inbox/sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the agents token", async () => {
    const res = await request(createApp()).post("/api/agents/inbox/sync");
    expect(res.status).toBe(401);
  });

  it("syncs the mock inbox (Gmail unconfigured) and inserts each message", async () => {
    const res = await request(createApp()).post("/api/agents/inbox/sync").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.synced).toBeGreaterThan(0);
    expect(dbMock.insertInboxMessageIfNew).toHaveBeenCalled();
  });
});

describe("GET /api/agents/inbox/pending + PATCH draft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists pending messages", async () => {
    dbMock.listNewInboxMessages.mockResolvedValue([{ id: "m1" }]);
    const res = await request(createApp()).get("/api/agents/inbox/pending").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("rejects an empty draft", async () => {
    const res = await request(createApp()).patch("/api/agents/inbox/m1/draft").set(AUTH).send({ draftedReply: "" });
    expect(res.status).toBe(400);
    expect(dbMock.setInboxDraft).not.toHaveBeenCalled();
  });

  it("submits a valid draft", async () => {
    const res = await request(createApp())
      .patch("/api/agents/inbox/m1/draft")
      .set(AUTH)
      .send({ draftedReply: "Sure, Thursday works!" });
    expect(res.status).toBe(200);
    expect(dbMock.setInboxDraft).toHaveBeenCalledWith("m1", "Sure, Thursday works!");
  });
});

describe("POST /api/agents/calendar/propose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes slots and stores a proposal", async () => {
    dbMock.insertCalendarProposal.mockResolvedValue({ id: "p1" });

    const res = await request(createApp())
      .post("/api/agents/calendar/propose")
      .set(AUTH)
      .send({ contactName: "Jane", contactEmail: "jane@example.com", purpose: "AC repair" });

    expect(res.status).toBe(201);
    expect(dbMock.insertCalendarProposal).toHaveBeenCalledWith(
      expect.objectContaining({ contactName: "Jane", purpose: "AC repair" })
    );
  });

  it("rejects a missing purpose", async () => {
    const res = await request(createApp()).post("/api/agents/calendar/propose").set(AUTH).send({ contactName: "Jane" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/agents/invoices/draft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a draft invoice from line items", async () => {
    dbMock.insertInvoiceDraft.mockResolvedValue({ id: "i1" });

    const res = await request(createApp())
      .post("/api/agents/invoices/draft")
      .set(AUTH)
      .send({ clientEmail: "owner@acme.com", lineItems: [{ description: "October service", amountCents: 15000 }] });

    expect(res.status).toBe(201);
    expect(dbMock.insertInvoiceDraft).toHaveBeenCalled();
  });

  it("rejects an empty line-item list", async () => {
    const res = await request(createApp())
      .post("/api/agents/invoices/draft")
      .set(AUTH)
      .send({ clientEmail: "owner@acme.com", lineItems: [] });
    expect(res.status).toBe(400);
    expect(dbMock.insertInvoiceDraft).not.toHaveBeenCalled();
  });
});

describe("SMS agent endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists pending texts", async () => {
    dbMock.listNewSms.mockResolvedValue([{ id: "s1" }]);
    const res = await request(createApp()).get("/api/agents/sms/pending").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("submits a drafted reply", async () => {
    const res = await request(createApp())
      .patch("/api/agents/sms/s1/draft")
      .set(AUTH)
      .send({ draftedReply: "See you then!" });
    expect(res.status).toBe(200);
    expect(dbMock.setSmsDraft).toHaveBeenCalledWith("s1", "See you then!");
  });
});
