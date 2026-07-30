/**
 * Builds the downloadable desktop-agent zip a customer gets after
 * checkout. The package itself (desktop-agent/, a sibling to this repo's
 * backend/) is a separate npm package with its own build step — this
 * file only assembles what's already on disk in desktop-agent/dist
 * (built via `npm run build` there) into the zip a customer receives; it
 * never compiles anything itself.
 */
import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Writable } from "node:stream";
import type { Tier } from "./stripe.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** DESKTOP_AGENT_DIR_OVERRIDE lets tests point this at a throwaway fixture directory instead of the real sibling package — resolved once at import time like every other env-driven constant in this codebase. */
const DESKTOP_AGENT_DIR = process.env.DESKTOP_AGENT_DIR_OVERRIDE ?? path.join(REPO_ROOT, "desktop-agent");
const DESKTOP_AGENT_DIST = path.join(DESKTOP_AGENT_DIR, "dist");

export class DesktopAgentNotBuiltError extends Error {
  constructor() {
    super("desktop-agent/dist is missing — run `npm run build` inside desktop-agent before serving downloads.");
  }
}

export function isDesktopAgentBuilt(): boolean {
  return fs.existsSync(DESKTOP_AGENT_DIST);
}

interface TrimmedPackageJson {
  name: string;
  version: string;
  description: string;
  private: true;
  type: "module";
  main: string;
  scripts: { start: string };
  dependencies: Record<string, string>;
  engines: Record<string, string>;
}

/** Ships only what a customer needs to `npm install && npm start` — no devDependencies, no build/test/lint scripts, nothing that assumes they have TypeScript tooling. */
function buildTrimmedPackageJson(): string {
  const full = JSON.parse(fs.readFileSync(path.join(DESKTOP_AGENT_DIR, "package.json"), "utf8")) as {
    name: string;
    version: string;
    description: string;
    main: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    engines: Record<string, string>;
  };
  const trimmed: TrimmedPackageJson = {
    name: full.name,
    version: full.version,
    description: full.description,
    private: true,
    type: "module",
    main: full.main,
    scripts: { start: full.scripts.start },
    dependencies: full.dependencies,
    engines: full.engines,
  };
  return JSON.stringify(trimmed, null, 2);
}

/** ANTHROPIC_API_KEY is deliberately left blank — see desktop-agent/src/config/env.ts's comment on why that key never passes through this backend. */
function buildEnvFile(input: { tier: Tier; agentKey: string }): string {
  return [
    `SUBSCRIPTION_TIER=${input.tier}`,
    `AGENT_KEY=${input.agentKey}`,
    `ANTHROPIC_API_KEY=`,
    `HEARTBEAT_INTERVAL_MINUTES=15`,
    `WIZARD_PORT=4090`,
    "",
  ].join("\n");
}

export function streamAgentPackageZip(destination: Writable, input: { tier: Tier; agentKey: string }): Promise<void> {
  if (!isDesktopAgentBuilt()) return Promise.reject(new DesktopAgentNotBuiltError());

  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.on("error", reject);
    archive.on("end", resolve);

    archive.pipe(destination);
    // desktop-agent's build compiles *.test.ts alongside everything else
    // (see agents/backend's dist/ — same known tradeoff there), which is
    // fine for packages that only ever run inside this repo's own infra.
    // This zip goes to a paying customer, so it's filtered out here
    // rather than changing that shared build convention everywhere.
    archive.directory(DESKTOP_AGENT_DIST, "dist", (entry) => {
      if (/\.test\.js(\.map)?$/.test(entry.name)) return false;
      return entry;
    });
    archive.append(buildTrimmedPackageJson(), { name: "package.json" });
    archive.append(buildEnvFile(input), { name: ".env" });
    archive.file(path.join(DESKTOP_AGENT_DIR, "README.md"), { name: "README.md" });
    void archive.finalize();
  });
}
