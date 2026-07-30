import { describe, expect, it } from "vitest";
import { TIER_CONFIG, tierConfig, isLaneEnabled } from "./tiers.js";

describe("TIER_CONFIG", () => {
  it("mirrors backend/src/lib/tiers.ts's shape exactly", () => {
    expect(TIER_CONFIG.starter.capabilityLanes).toEqual(["front-desk"]);
    expect(TIER_CONFIG.core.capabilityLanes).toEqual(["front-desk", "sales-ledger", "back-office"]);
    expect(TIER_CONFIG.scale.capabilityLanes).toEqual([
      "front-desk",
      "sales-ledger",
      "back-office",
      "night-report",
    ]);
    expect(TIER_CONFIG.starter.dailyTaskCap).toBe(40);
    expect(TIER_CONFIG.core.dailyTaskCap).toBe(150);
    expect(TIER_CONFIG.scale.dailyTaskCap).toBe(500);
  });

  it("gives every higher tier a superset of the lower tier's lanes", () => {
    const starter = new Set(TIER_CONFIG.starter.capabilityLanes);
    const core = new Set(TIER_CONFIG.core.capabilityLanes);
    const scale = new Set(TIER_CONFIG.scale.capabilityLanes);
    for (const lane of starter) expect(core.has(lane)).toBe(true);
    for (const lane of core) expect(scale.has(lane)).toBe(true);
  });
});

describe("isLaneEnabled", () => {
  it("says no for a lane above the tier's ceiling", () => {
    expect(isLaneEnabled("starter", "back-office")).toBe(false);
    expect(isLaneEnabled("starter", "night-report")).toBe(false);
  });

  it("says yes for a lane within the tier's ceiling", () => {
    expect(isLaneEnabled("core", "front-desk")).toBe(true);
    expect(isLaneEnabled("core", "back-office")).toBe(true);
    expect(isLaneEnabled("scale", "night-report")).toBe(true);
  });

  it("tierConfig returns the same object as the map", () => {
    expect(tierConfig("starter")).toBe(TIER_CONFIG.starter);
  });
});
