import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

/** Two levels up from any file under src/ (dev, via tsx) or dist/ (built) lands on the package root either way. */
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** DESKTOP_AGENT_HOME overrides this for tests (see test/setup.ts) so nothing under test ever touches this repo's real data/ or .env — resolved once at import time like every other env-driven constant in this codebase. */
export const PACKAGE_ROOT = process.env.DESKTOP_AGENT_HOME ?? DEFAULT_ROOT;
export const DATA_DIR = path.join(PACKAGE_ROOT, "data");

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
