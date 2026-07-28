import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// lib/vapi.js runs for real (mock mode, no VAPI_PRIVATE_API_KEY in test
// env) so this exercises the actual cold-call code path end to end; only
// the DB layer is mocked.
const dbMock = vi.hoisted(() => ({
  getProspect: vi.fn(),
  insertColdCall: vi.fn(),
  setProspectStatus: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");

const AUTH = { authorization: "Bearer test-dashboard-token" };

describe("POST /api/vapi/cold-call/:prospectId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token — this is the founder-approval gate", async () => {
    const res = await request(createApp()).post("/api/vapi/cold-call/p1");
    expect(res.status).toBe(401);
    expect(dbMock.getProspect).not.toHaveBeenCalled();
  });

  it("404s for an unknown prospect without placing a call", async () => {
    dbMock.getProspect.mockResolvedValue(null);

    const res = await request(createApp()).post("/api/vapi/cold-call/does-not-exist").set(AUTH);

    expect(res.status).toBe(404);
    expect(dbMock.insertColdCall).not.toHaveBeenCalled();
  });

  it("places a mock call, logs it, and moves the prospect to 'calling'", async () => {
    dbMock.getProspect.mockResolvedValue({
      id: "p1",
      business_name: "Main Street Auto Repair",
      phone: "+15551234567",
    });

    const res = await request(createApp()).post("/api/vapi/cold-call/p1").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(dbMock.insertColdCall).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: "p1", triggeredBy: "founder_dashboard" })
    );
    expect(dbMock.setProspectStatus).toHaveBeenCalledWith("p1", "calling");
  });
});
