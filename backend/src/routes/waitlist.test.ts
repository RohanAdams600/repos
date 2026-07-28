import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({ insertLead: vi.fn() }));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");

const validLead = {
  email: "owner@acme.com",
  businessName: "Acme Services LLC",
  revenueBand: "80k_250k",
  teamSize: "5_20",
  timeSink: "Manually following up with every inbound lead within a few hours",
  tierInterest: "core",
  referredByClient: false,
};

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid submission and returns the created lead", async () => {
    dbMock.insertLead.mockResolvedValue({ id: "lead-123", email: validLead.email });

    const res = await request(createApp()).post("/api/waitlist").send(validLead);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "lead-123", email: validLead.email });
    expect(dbMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ email: validLead.email, tierInterest: "core" })
    );
  });

  it("rejects an invalid email with 400 and does not touch the database", async () => {
    const res = await request(createApp())
      .post("/api/waitlist")
      .send({ ...validLead, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(dbMock.insertLead).not.toHaveBeenCalled();
  });

  it("rejects an unknown tierInterest value", async () => {
    const res = await request(createApp())
      .post("/api/waitlist")
      .send({ ...validLead, tierInterest: "enterprise" });

    expect(res.status).toBe(400);
  });

  it("rejects a time-sink answer that's too short to be useful to Scout", async () => {
    const res = await request(createApp())
      .post("/api/waitlist")
      .send({ ...validLead, timeSink: "emails" });

    expect(res.status).toBe(400);
  });

  it("returns 500 without leaking internals when the database call fails", async () => {
    dbMock.insertLead.mockRejectedValue(new Error("connection refused"));

    const res = await request(createApp()).post("/api/waitlist").send(validLead);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
  });
});
