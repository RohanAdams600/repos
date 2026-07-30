import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDataDir } from "./paths.js";
import { tierConfig, type CapabilityLane, type Tier } from "../config/tiers.js";

const STATE_PATH = path.join(DATA_DIR, "state.json");
const MAX_LOG_ENTRIES = 200;

export interface LogEntry {
  at: string;
  lane: CapabilityLane;
  summary: string;
}

export interface AgentState {
  /** YYYY-MM-DD, local machine date the counters below apply to. */
  date: string;
  tasksProcessedToday: number;
  log: LogEntry[];
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Resets tasksProcessedToday the moment the stored date no longer matches — the daily cap is enforced against this, not against wall-clock time directly, so a cycle right after midnight always sees a fresh 0. */
export function loadState(now = new Date()): AgentState {
  if (!fs.existsSync(STATE_PATH)) {
    return { date: todayKey(now), tasksProcessedToday: 0, log: [] };
  }
  const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as AgentState;
  if (raw.date !== todayKey(now)) {
    return { date: todayKey(now), tasksProcessedToday: 0, log: raw.log.slice(-MAX_LOG_ENTRIES) };
  }
  return raw;
}

export function saveState(state: AgentState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function remainingCapacity(tier: Tier, now = new Date()): number {
  const state = loadState(now);
  return Math.max(0, tierConfig(tier).dailyTaskCap - state.tasksProcessedToday);
}

export function canProcessOneMore(tier: Tier, now = new Date()): boolean {
  return remainingCapacity(tier, now) > 0;
}

export function recordProcessed(input: { lane: CapabilityLane; summary: string }, now = new Date()): AgentState {
  const state = loadState(now);
  state.tasksProcessedToday += 1;
  state.log = [...state.log, { at: now.toISOString(), lane: input.lane, summary: input.summary }].slice(
    -MAX_LOG_ENTRIES
  );
  saveState(state);
  return state;
}
