import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  listCalendarProposals: vi.fn(),
  getCalendarProposal: vi.fn(),
  markCalendarProposalBooked: vi.fn(),
  markCalendarProposalDeclined: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");
const AUTH = { authorization: "Bearer test-dashboard-token" };

const FUTURE_SLOT = new Date(Date.now() + 86_400_000).toISOString();

describe("POST /api/calendar/:id/book", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token — this is the founder-approval gate for boundary #2", async () => {
    const res = await request(createApp()).post("/api/calendar/p1/book").send({ slot: FUTURE_SLOT });
    expect(res.status).toBe(401);
    expect(dbMock.getCalendarProposal).not.toHaveBeenCalled();
  });

  it("404s for an unknown proposal", async () => {
    dbMock.getCalendarProposal.mockResolvedValue(null);
    const res = await request(createApp()).post("/api/calendar/p1/book").set(AUTH).send({ slot: FUTURE_SLOT });
    expect(res.status).toBe(404);
  });

  it("rejects a slot that wasn't one of the proposed options", async () => {
    dbMock.getCalendarProposal.mockResolvedValue({
      id: "p1",
      proposed_slots: [FUTURE_SLOT],
      purpose: "AC repair",
      contact_name: "Jane",
      contact_email: null,
    });
    const somethingElse = new Date(Date.now() + 2 * 86_400_000).toISOString();

    const res = await request(createApp()).post("/api/calendar/p1/book").set(AUTH).send({ slot: somethingElse });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("slot_not_proposed");
    expect(dbMock.markCalendarProposalBooked).not.toHaveBeenCalled();
  });

  it("books a proposed slot (mock mode) and records the booking", async () => {
    dbMock.getCalendarProposal.mockResolvedValue({
      id: "p1",
      proposed_slots: [FUTURE_SLOT],
      purpose: "AC repair",
      contact_name: "Jane",
      contact_email: "jane@example.com",
    });

    const res = await request(createApp()).post("/api/calendar/p1/book").set(AUTH).send({ slot: FUTURE_SLOT });

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.markCalendarProposalBooked).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ bookedSlot: FUTURE_SLOT })
    );
  });
});
