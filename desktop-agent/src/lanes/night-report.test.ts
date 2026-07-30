import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { DATA_DIR } from "../lib/paths.js";
import { saveState } from "../lib/state.js";
import { maybeWriteNightlyReport } from "./night-report.js";

describe("maybeWriteNightlyReport", () => {
  beforeEach(() => {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("does nothing before the report hour", () => {
    const morning = new Date("2026-07-30T10:00:00");
    const result = maybeWriteNightlyReport(morning);
    expect(result.written).toBe(false);
  });

  it("writes a report after the report hour, summarizing today's log by lane", () => {
    const dateKey = "2026-07-30";
    saveState({
      date: dateKey,
      tasksProcessedToday: 3,
      log: [
        { at: `${dateKey}T09:00:00.000Z`, lane: "front-desk", summary: "a" },
        { at: `${dateKey}T10:00:00.000Z`, lane: "front-desk", summary: "b" },
        { at: `${dateKey}T11:00:00.000Z`, lane: "back-office", summary: "c" },
      ],
    });

    const evening = new Date(`${dateKey}T21:00:00.000Z`);
    const result = maybeWriteNightlyReport(evening);

    expect(result.written).toBe(true);
    expect(result.path).toBeDefined();
    const contents = fs.readFileSync(result.path!, "utf8");
    expect(contents).toContain("Tasks drafted today: 3");
    expect(contents).toContain("front-desk: 2");
    expect(contents).toContain("back-office: 1");
  });

  it("only writes once per day even if called again later the same evening", () => {
    const dateKey = "2026-07-30";
    saveState({ date: dateKey, tasksProcessedToday: 1, log: [{ at: `${dateKey}T09:00:00.000Z`, lane: "front-desk", summary: "a" }] });

    const first = maybeWriteNightlyReport(new Date(`${dateKey}T21:00:00.000Z`));
    const second = maybeWriteNightlyReport(new Date(`${dateKey}T23:00:00.000Z`));

    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
  });
});
