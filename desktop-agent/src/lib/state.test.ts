import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { DATA_DIR } from "./paths.js";
import { loadState, saveState, recordProcessed, remainingCapacity, canProcessOneMore } from "./state.js";

const DAY_ONE = new Date("2026-07-30T10:00:00Z");
const SAME_DAY_LATER = new Date("2026-07-30T22:00:00Z");
const NEXT_DAY = new Date("2026-07-31T09:00:00Z");

describe("state", () => {
  beforeEach(() => {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("starts at zero tasks processed when no state file exists", () => {
    const state = loadState(DAY_ONE);
    expect(state.tasksProcessedToday).toBe(0);
    expect(state.log).toEqual([]);
  });

  it("increments tasksProcessedToday and appends to the log on recordProcessed", () => {
    recordProcessed({ lane: "front-desk", summary: "drafted a reply" }, DAY_ONE);
    recordProcessed({ lane: "front-desk", summary: "drafted another reply" }, SAME_DAY_LATER);

    const state = loadState(SAME_DAY_LATER);
    expect(state.tasksProcessedToday).toBe(2);
    expect(state.log).toHaveLength(2);
  });

  it("resets the counter on a new calendar day but keeps the log", () => {
    recordProcessed({ lane: "front-desk", summary: "day one item" }, DAY_ONE);
    const rolledOver = loadState(NEXT_DAY);
    expect(rolledOver.tasksProcessedToday).toBe(0);
    expect(rolledOver.log).toHaveLength(1); // yesterday's entries survive, just don't count against today's cap
  });

  it("computes remaining capacity against the tier's daily cap (core = 150)", () => {
    expect(remainingCapacity("core", DAY_ONE)).toBe(150);
    for (let i = 0; i < 5; i++) recordProcessed({ lane: "front-desk", summary: `item ${i}` }, DAY_ONE);
    expect(remainingCapacity("core", DAY_ONE)).toBe(145);
  });

  it("never returns negative remaining capacity even if somehow over-processed", () => {
    saveState({ date: "2026-07-30", tasksProcessedToday: 999, log: [] });
    expect(remainingCapacity("starter", DAY_ONE)).toBe(0);
  });

  it("canProcessOneMore flips to false exactly at the cap (starter = 40)", () => {
    for (let i = 0; i < 40; i++) recordProcessed({ lane: "front-desk", summary: `item ${i}` }, DAY_ONE);
    expect(canProcessOneMore("starter", DAY_ONE)).toBe(false);
    expect(canProcessOneMore("core", DAY_ONE)).toBe(true); // same day's count, higher tier's cap
  });
});
