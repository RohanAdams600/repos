import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  listProspects: vi.fn(),
  insertProspect: vi.fn(),
  setProspectStatus: vi.fn(),
}));
vi.mock("../lib/db.js", () => dbMock);

const { createApp } = await import("../app.js");

const AUTH = { authorization: "Bearer test-dashboard-token" };

const validProspect = {
  businessName: "Main Street Auto Repair",
  category: "automotive_repair",
  phone: "+15551234567",
  city: "Springfield",
  state: "IL",
  teamSize: "1_4",
  fitReasoning: "Closes at 5pm, single location, no answering service — found via local directory.",
};

describe("GET /api/prospects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dashboard token", async () => {
    const res = await request(createApp()).get("/api/prospects");
    expect(res.status).toBe(401);
    expect(dbMock.listProspects).not.toHaveBeenCalled();
  });

  it("returns the prospect list for an authenticated request", async () => {
    dbMock.listProspects.mockResolvedValue([{ id: "p1", business_name: "Main Street Auto Repair" }]);

    const res = await request(createApp()).get("/api/prospects").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.prospects).toHaveLength(1);
  });
});

describe("POST /api/prospects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated request", async () => {
    const res = await request(createApp()).post("/api/prospects").send(validProspect);
    expect(res.status).toBe(401);
  });

  it("creates a prospect from valid input", async () => {
    dbMock.insertProspect.mockResolvedValue({ id: "p1", ...validProspect });

    const res = await request(createApp()).post("/api/prospects").set(AUTH).send(validProspect);

    expect(res.status).toBe(201);
    expect(dbMock.insertProspect).toHaveBeenCalledWith(expect.objectContaining({ businessName: validProspect.businessName }));
  });

  it("rejects a fit-reasoning shorter than the minimum — forces real reasoning, not a one-word guess", async () => {
    const res = await request(createApp())
      .post("/api/prospects")
      .set(AUTH)
      .send({ ...validProspect, fitReasoning: "good fit" });

    expect(res.status).toBe(400);
    expect(dbMock.insertProspect).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/prospects/:id/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates status for an authenticated request", async () => {
    const res = await request(createApp())
      .patch("/api/prospects/p1/status")
      .set(AUTH)
      .send({ status: "approved" });

    expect(res.status).toBe(200);
    expect(dbMock.setProspectStatus).toHaveBeenCalledWith("p1", "approved");
  });

  it("rejects a status outside the known set", async () => {
    const res = await request(createApp())
      .patch("/api/prospects/p1/status")
      .set(AUTH)
      .send({ status: "do_not_call_ever" });

    expect(res.status).toBe(400);
    expect(dbMock.setProspectStatus).not.toHaveBeenCalled();
  });
});
