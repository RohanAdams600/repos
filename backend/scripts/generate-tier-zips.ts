/**
 * One-off script — NOT part of the app. Generates all 3 tier-specific
 * customer zips directly, using the exact same packaging function the
 * live download route (routes/downloads.ts) calls, without needing a
 * real checkout session or a deployed backend. Useful for handing over
 * real deliverables before the backend has a public URL to check out
 * against.
 *
 * Usage: npx tsx scripts/generate-tier-zips.ts <output-dir>
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { streamAgentPackageZip } from "../src/lib/agent-package.js";
import type { Tier } from "../src/lib/stripe.js";

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: npx tsx scripts/generate-tier-zips.ts <output-dir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const TIERS: Tier[] = ["starter", "core", "scale"];

async function main(): Promise<void> {
  for (const tier of TIERS) {
    const dest = path.join(outDir, `night-desk-${tier}.zip`);
    const stream = fs.createWriteStream(dest);
    await streamAgentPackageZip(stream, { tier, agentKey: randomUUID().replace(/-/g, "") });
    console.log(`Wrote ${dest}`);
  }
}

main().catch((err) => {
  console.error("Failed to generate tier zips:", err);
  process.exit(1);
});
