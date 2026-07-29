import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  listSmsMessages: vi.fn(),
  getSmsMessage: vi.fn(),
  recordSmsSent: vi.fn(),
  insertInboundSms: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");
const AUTH = { authorization: "Bearer test-dashboard-token" };

describe("POST /api/sms/:id/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token", async () => {
    const res = await request(createApp()).post("/api/sms/s1/send");
    expect(res.status).toBe(401);
  });

  it("refuses to send a text with no drafted reply", async () => {
    dbMock.getSmsMessage.mockResolvedValue({ id: "s1", drafted_reply: null });
    const res = await request(createApp()).post("/api/sms/s1/send").set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_draft");
  });

  it("sends the drafted reply (mock mode) and records it", async () => {
    dbMock.getSmsMessage.mockResolvedValue({ id: "s1", phone: "+15551234567", drafted_reply: "See you then!" });

    const res = await request(createApp()).post("/api/sms/s1/send").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.recordSmsSent).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ phone: "+15551234567", body: "See you then!" })
    );
  });
});

describe("POST /api/webhooks/twilio/sms (inbound)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts an inbound text without a signature when Twilio isn't configured (mock mode)", async () => {
    const res = await request(createApp())
      .post("/api/webhooks/twilio/sms")
      .type("form")
      .send({ From: "+15551234567", Body: "Do you have anything Thursday?", MessageSid: "SM123" });

    expect(res.status).toBe(200);
    expect(dbMock.insertInboundSms).toHaveBeenCalledWith({
      phone: "+15551234567",
      body: "Do you have anything Thursday?",
      twilioSid: "SM123",
    });
  });
});
