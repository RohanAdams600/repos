import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, PACKAGE_ROOT } from "../lib/paths.js";
import { loadProfile } from "../lib/profile.js";
import { createWizardApp } from "./server.js";

const VALID_INPUT = {
  businessName: "Riverside Plaza HVAC",
  hours: "Mon-Fri 8-6",
  services: "AC repair and install",
  pricingNotes: "from $150",
  tone: "friendly, direct",
  contactEmail: "owner@riverside.example",
  contactPhone: "555-0100",
};

describe("wizard server", () => {
  beforeEach(() => {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    fs.rmSync(path.join(PACKAGE_ROOT, ".env"), { force: true });
  });

  it("GET /api/status reports the current tier and its unlocked lanes", async () => {
    const res = await request(createWizardApp()).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe("core");
    expect(res.body.capabilityLanes).toContain("back-office");
    expect(res.body.capabilityLanes).not.toContain("night-report");
  });

  it("POST /api/setup rejects an incomplete submission", async () => {
    const res = await request(createWizardApp()).post("/api/setup").send({ businessName: "Only This" });
    expect(res.status).toBe(400);
    expect(loadProfile()).toBeNull();
  });

  it("POST /api/setup saves a valid profile", async () => {
    const res = await request(createWizardApp()).post("/api/setup").send(VALID_INPUT);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const saved = loadProfile();
    expect(saved?.businessName).toBe("Riverside Plaza HVAC");
  });

  it("POST /api/setup writes the Anthropic key to .env when provided, without touching it when omitted", async () => {
    await request(createWizardApp()).post("/api/setup").send(VALID_INPUT);
    expect(fs.existsSync(path.join(PACKAGE_ROOT, ".env"))).toBe(false);

    await request(createWizardApp())
      .post("/api/setup")
      .send({ ...VALID_INPUT, anthropicApiKey: "sk-ant-from-wizard" });
    const contents = fs.readFileSync(path.join(PACKAGE_ROOT, ".env"), "utf8");
    expect(contents).toContain("ANTHROPIC_API_KEY=sk-ant-from-wizard");
  });
});
