/**
 * Runs before each test file's module graph loads, so config/env.ts's
 * process.env-reading zod parse (which happens at import time) sees a
 * valid, minimal configuration by default.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SUBSCRIPTION_TIER = "core";
process.env.AGENT_KEY = "test-agent-key";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
process.env.HEARTBEAT_INTERVAL_MINUTES = "15";
process.env.WIZARD_PORT = "4090";
process.env.LOG_LEVEL = "silent";

// Every file-writing module (profile.ts, state.ts, queue.ts, env-writer.ts)
// resolves its paths from this at import time — pointing it at a fresh
// temp dir per test file means tests never touch this package's real
// data/ or .env, and never collide with each other across files.
process.env.DESKTOP_AGENT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "autonoma-desktop-agent-test-"));

