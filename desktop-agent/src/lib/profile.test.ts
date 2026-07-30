import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { DATA_DIR } from "./paths.js";
import { loadProfile, profileExists, saveProfile, profileToContextBlock, type BusinessProfile } from "./profile.js";

const PROFILE: BusinessProfile = {
  businessName: "Riverside Plaza HVAC",
  hours: "Mon-Fri 8-6",
  services: "AC repair, install, maintenance",
  pricingNotes: "service calls from $150",
  tone: "friendly, direct",
  contactEmail: "owner@riverside.example",
  contactPhone: "555-0100",
};

describe("profile", () => {
  beforeEach(() => {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("reports no profile before one is saved", () => {
    expect(profileExists()).toBe(false);
    expect(loadProfile()).toBeNull();
  });

  it("round-trips a saved profile", () => {
    saveProfile(PROFILE);
    expect(profileExists()).toBe(true);
    expect(loadProfile()).toEqual(PROFILE);
  });

  it("renders every field into the context block", () => {
    const block = profileToContextBlock(PROFILE);
    expect(block).toContain("Riverside Plaza HVAC");
    expect(block).toContain("AC repair, install, maintenance");
    expect(block).toContain("owner@riverside.example");
    expect(block).toContain("555-0100");
  });
});
