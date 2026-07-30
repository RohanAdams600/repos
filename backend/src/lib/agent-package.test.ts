import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import AdmZip from "adm-zip";

// Points agent-package.ts at a throwaway fixture instead of the real
// sibling desktop-agent/ package, set before the dynamic import below so
// the module-level DESKTOP_AGENT_DIR constant picks it up at load time.
const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-agent-fixture-"));
process.env.DESKTOP_AGENT_DIR_OVERRIDE = FIXTURE_DIR;

function writeFixture(): void {
  fs.mkdirSync(path.join(FIXTURE_DIR, "dist", "lanes"), { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "dist", "index.js"), "console.log('agent running');");
  fs.writeFileSync(path.join(FIXTURE_DIR, "dist", "lanes", "front-desk.test.js"), "// test file, should never ship");
  fs.writeFileSync(path.join(FIXTURE_DIR, "dist", "lanes", "front-desk.test.js.map"), "{}");
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "package.json"),
    JSON.stringify({
      name: "@autonoma/desktop-agent",
      version: "1.0.0",
      description: "test fixture",
      main: "dist/index.js",
      scripts: { start: "node dist/index.js", build: "tsc", test: "vitest run" },
      dependencies: { "@anthropic-ai/sdk": "^0.32.1" },
      devDependencies: { typescript: "^5.7.2" },
      engines: { node: ">=20" },
    })
  );
  fs.writeFileSync(path.join(FIXTURE_DIR, "README.md"), "# Your Autonoma Agent");
}

const { isDesktopAgentBuilt, streamAgentPackageZip, DesktopAgentNotBuiltError } = await import("./agent-package.js");

describe("agent-package", () => {
  beforeEach(() => {
    fs.rmSync(path.join(FIXTURE_DIR, "dist"), { recursive: true, force: true });
    fs.rmSync(path.join(FIXTURE_DIR, "package.json"), { force: true });
    fs.rmSync(path.join(FIXTURE_DIR, "README.md"), { force: true });
  });

  it("reports not built when dist/ doesn't exist", () => {
    expect(isDesktopAgentBuilt()).toBe(false);
  });

  it("rejects with DesktopAgentNotBuiltError if asked to stream before a build exists", async () => {
    const sink = new PassThrough();
    await expect(streamAgentPackageZip(sink, { tier: "core", agentKey: "key-123" })).rejects.toBeInstanceOf(
      DesktopAgentNotBuiltError
    );
  });

  it("streams a zip containing a trimmed package.json, a stamped .env, README.md, and dist/", async () => {
    writeFixture();
    expect(isDesktopAgentBuilt()).toBe(true);

    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (chunk) => chunks.push(chunk));

    await streamAgentPackageZip(sink, { tier: "scale", agentKey: "agent-key-xyz" });

    const zip = new AdmZip(Buffer.concat(chunks));
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("package.json");
    expect(entries).toContain(".env");
    expect(entries).toContain("README.md");
    expect(entries).toContain("dist/index.js");
    expect(entries.some((e) => e.endsWith(".test.js") || e.endsWith(".test.js.map"))).toBe(false); // never ships to a customer

    const pkg = JSON.parse(zip.getEntry("package.json")!.getData().toString("utf8"));
    expect(pkg.scripts).toEqual({ start: "node dist/index.js" }); // build/test scripts stripped
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.dependencies).toEqual({ "@anthropic-ai/sdk": "^0.32.1" });

    const envContents = zip.getEntry(".env")!.getData().toString("utf8");
    expect(envContents).toContain("SUBSCRIPTION_TIER=scale");
    expect(envContents).toContain("AGENT_KEY=agent-key-xyz");
    expect(envContents).toContain("ANTHROPIC_API_KEY=\n"); // present but blank — never Autonoma's key
  });
});
