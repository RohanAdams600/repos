import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAgentsToken, requireDashboardToken } from "./auth.js";

function mockReqRes(authHeader?: string) {
  const req = { headers: { authorization: authHeader } } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = vi.fn();
  return { req, res, status, json, next };
}

describe("requireAgentsToken", () => {
  it("rejects a missing Authorization header", () => {
    const { req, res, status, json, next } = mockReqRes(undefined);
    requireAgentsToken(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects the wrong token", () => {
    const { req, res, status, next } = mockReqRes("Bearer wrong-token");
    requireAgentsToken(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts the configured agents token (set in test/setup.ts)", () => {
    const { req, res, status, next } = mockReqRes("Bearer test-agents-token");
    requireAgentsToken(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a dashboard token presented on the agents route", () => {
    const { req, res, status, next } = mockReqRes("Bearer test-dashboard-token");
    requireAgentsToken(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireDashboardToken", () => {
  it("accepts the configured dashboard token", () => {
    const { req, res, status, next } = mockReqRes("Bearer test-dashboard-token");
    requireDashboardToken(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a malformed header without the Bearer prefix", () => {
    const { req, res, status, next } = mockReqRes("test-dashboard-token");
    requireDashboardToken(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
