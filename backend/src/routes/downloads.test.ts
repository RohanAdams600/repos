import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  findDownloadTokenBySession: vi.fn(),
  findDownloadToken: vi.fn(),
  markTokenDownloaded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/db.js", () => dbMock);

const agentPackageMock = vi.hoisted(() => ({
  isDesktopAgentBuilt: vi.fn(() => true),
  streamAgentPackageZip: vi.fn(async (destination: NodeJS.WritableStream) => {
    destination.write("fake zip bytes");
    (destination as import("node:stream").Writable).end();
  }),
}));
vi.mock("../lib/agent-package.js", () => agentPackageMock);

const { createApp } = await import("../app.js");

describe("GET /api/downloads/agent/by-session/:sessionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a valid session to its token and tier", async () => {
    dbMock.findDownloadTokenBySession.mockResolvedValue({ token: "tok_abc", tier: "core" });
    const res = await request(createApp()).get("/api/downloads/agent/by-session/sess_123");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: "tok_abc", tier: "core" });
  });

  it("404s for an unknown session id", async () => {
    dbMock.findDownloadTokenBySession.mockResolvedValue(null);
    const res = await request(createApp()).get("/api/downloads/agent/by-session/sess_unknown");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/downloads/agent/:token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentPackageMock.isDesktopAgentBuilt.mockReturnValue(true);
  });

  it("404s for an unknown token", async () => {
    dbMock.findDownloadToken.mockResolvedValue(null);
    const res = await request(createApp()).get("/api/downloads/agent/tok_unknown");
    expect(res.status).toBe(404);
  });

  it("streams the zip and marks the token downloaded, for a valid token", async () => {
    dbMock.findDownloadToken.mockResolvedValue({ token: "tok_abc", tier: "scale", agent_key: "key-xyz" });

    const res = await request(createApp()).get("/api/downloads/agent/tok_abc");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("autonoma-agent-scale.zip");
    expect(agentPackageMock.streamAgentPackageZip).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tier: "scale", agentKey: "key-xyz" })
    );
    expect(dbMock.markTokenDownloaded).toHaveBeenCalledWith("tok_abc");
  });

  it("503s with a clear error if desktop-agent hasn't been built", async () => {
    dbMock.findDownloadToken.mockResolvedValue({ token: "tok_abc", tier: "core", agent_key: "key-xyz" });
    agentPackageMock.isDesktopAgentBuilt.mockReturnValue(false);

    const res = await request(createApp()).get("/api/downloads/agent/tok_abc");

    expect(res.status).toBe(503);
    expect(agentPackageMock.streamAgentPackageZip).not.toHaveBeenCalled();
  });
});
