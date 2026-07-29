import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  listInboxMessages: vi.fn(),
  getInboxMessage: vi.fn(),
  setInboxStatus: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");
const AUTH = { authorization: "Bearer test-dashboard-token" };

describe("GET /api/inbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token", async () => {
    const res = await request(createApp()).get("/api/inbox");
    expect(res.status).toBe(401);
  });

  it("returns the message list for an authenticated request", async () => {
    dbMock.listInboxMessages.mockResolvedValue([{ id: "m1" }]);
    const res = await request(createApp()).get("/api/inbox").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });
});

describe("POST /api/inbox/:id/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404s for an unknown message", async () => {
    dbMock.getInboxMessage.mockResolvedValue(null);
    const res = await request(createApp()).post("/api/inbox/does-not-exist/send").set(AUTH);
    expect(res.status).toBe(404);
  });

  it("refuses to send a message with no drafted reply — nothing to approve yet", async () => {
    dbMock.getInboxMessage.mockResolvedValue({ id: "m1", drafted_reply: null });
    const res = await request(createApp()).post("/api/inbox/m1/send").set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_draft");
  });

  it("sends the drafted reply (mock mode) and marks the message sent", async () => {
    dbMock.getInboxMessage.mockResolvedValue({
      id: "m1",
      external_id: "gmail-1",
      from_email: "owner@acme.com",
      subject: "Question",
      drafted_reply: "Sure, Thursday works!",
    });

    const res = await request(createApp()).post("/api/inbox/m1/send").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.setInboxStatus).toHaveBeenCalledWith("m1", "sent");
  });
});
