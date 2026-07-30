import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDataDir } from "../lib/paths.js";
import { loadState } from "../lib/state.js";
import { logger } from "../lib/logger.js";

const REPORT_HOUR = 20; // 8pm local — mirrors backend/src/lib/reports.ts's REPORT_HOUR gate

function reportPath(dateKey: string): string {
  return path.join(DATA_DIR, "reports", `${dateKey}.md`);
}

/**
 * File-on-disk idempotency instead of backend's atomic DB INSERT ...
 * ON CONFLICT: this package has no shared database, and a single local
 * process is the only writer, so "does this file already exist" is
 * exactly as safe here — there's no concurrent second writer to race.
 */
export function maybeWriteNightlyReport(now = new Date()): { written: boolean; path?: string } {
  const dateKey = now.toISOString().slice(0, 10);
  const file = reportPath(dateKey);
  if (fs.existsSync(file)) return { written: false };
  if (now.getHours() < REPORT_HOUR) return { written: false };

  const state = loadState(now);
  const todayEntries = state.log.filter((entry) => entry.at.slice(0, 10) === dateKey);
  const byLane = todayEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.lane] = (acc[entry.lane] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    `# Night Report — ${dateKey}`,
    "",
    `Tasks drafted today: ${todayEntries.length}`,
    ...Object.entries(byLane).map(([lane, count]) => `- ${lane}: ${count}`),
    "",
    "Every draft above is sitting in data/inbound/*.json waiting for your review — nothing sent itself.",
  ];

  ensureDataDir();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  logger.info({ file }, "night report written");
  return { written: true, path: file };
}
