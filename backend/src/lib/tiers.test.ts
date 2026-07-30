import { describe, expect, it } from "vitest";
import { TIER_CONFIG, tierConfig } from "./tiers.js";

describe("TIER_CONFIG", () => {
  it("gives every higher tier a superset of the lower tier's capability lanes", () => {
    const starterLanes = new Set(TIER_CONFIG.starter.capabilityLanes);
    const coreLanes = new Set(TIER_CONFIG.core.capabilityLanes);
    const scaleLanes = new Set(TIER_CONFIG.scale.capabilityLanes);

    for (const lane of starterLanes) expect(coreLanes.has(lane)).toBe(true);
    for (const lane of coreLanes) expect(scaleLanes.has(lane)).toBe(true);
  });

  it("increases the daily task cap strictly with each tier", () => {
    expect(TIER_CONFIG.starter.dailyTaskCap).toBeLessThan(TIER_CONFIG.core.dailyTaskCap);
    expect(TIER_CONFIG.core.dailyTaskCap).toBeLessThan(TIER_CONFIG.scale.dailyTaskCap);
  });

  it("never lets a lower tier auto-execute more than a higher tier", () => {
    const rank = { manual: 0, supervised: 1, autonomous: 2 } as const;
    expect(rank[TIER_CONFIG.starter.trustStageCeiling]).toBeLessThanOrEqual(rank[TIER_CONFIG.core.trustStageCeiling]);
    expect(rank[TIER_CONFIG.core.trustStageCeiling]).toBeLessThanOrEqual(rank[TIER_CONFIG.scale.trustStageCeiling]);
  });

  it("tierConfig looks up the same object as the map", () => {
    expect(tierConfig("scale")).toBe(TIER_CONFIG.scale);
  });
});
