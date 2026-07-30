import fs from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";

const ENV_PATH = path.join(PACKAGE_ROOT, ".env");

/**
 * Patches just the ANTHROPIC_API_KEY line in .env, leaving
 * SUBSCRIPTION_TIER/AGENT_KEY (stamped in at download time) untouched.
 * The key never leaves this machine — it's written straight to the
 * local .env file, never sent back to Autonoma's backend.
 */
export function writeApiKeyToEnvFile(apiKey: string): void {
  let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `ANTHROPIC_API_KEY=${apiKey}`;
  if (/^ANTHROPIC_API_KEY=.*$/m.test(contents)) {
    contents = contents.replace(/^ANTHROPIC_API_KEY=.*$/m, line);
  } else {
    contents = (contents.length > 0 ? contents.trimEnd() + "\n" : "") + line + "\n";
  }
  fs.writeFileSync(ENV_PATH, contents, "utf8");
}
