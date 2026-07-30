import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";
import { writeApiKeyToEnvFile } from "./env-writer.js";

const ENV_PATH = path.join(PACKAGE_ROOT, ".env");

describe("writeApiKeyToEnvFile", () => {
  beforeEach(() => {
    fs.rmSync(ENV_PATH, { force: true });
  });

  it("appends the key when .env doesn't have one yet", () => {
    fs.writeFileSync(ENV_PATH, "SUBSCRIPTION_TIER=core\nAGENT_KEY=abc123\n", "utf8");
    writeApiKeyToEnvFile("sk-ant-new-key");
    const contents = fs.readFileSync(ENV_PATH, "utf8");
    expect(contents).toContain("SUBSCRIPTION_TIER=core");
    expect(contents).toContain("ANTHROPIC_API_KEY=sk-ant-new-key");
  });

  it("replaces an existing ANTHROPIC_API_KEY line in place rather than duplicating it", () => {
    fs.writeFileSync(ENV_PATH, "SUBSCRIPTION_TIER=core\nANTHROPIC_API_KEY=sk-ant-old\nAGENT_KEY=abc123\n", "utf8");
    writeApiKeyToEnvFile("sk-ant-replacement");
    const contents = fs.readFileSync(ENV_PATH, "utf8");
    const matches = contents.match(/ANTHROPIC_API_KEY=/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(contents).toContain("ANTHROPIC_API_KEY=sk-ant-replacement");
    expect(contents).not.toContain("sk-ant-old");
    expect(contents).toContain("AGENT_KEY=abc123"); // untouched
  });

  it("creates .env from scratch if it doesn't exist at all", () => {
    writeApiKeyToEnvFile("sk-ant-fresh");
    expect(fs.readFileSync(ENV_PATH, "utf8")).toBe("ANTHROPIC_API_KEY=sk-ant-fresh\n");
  });
});
