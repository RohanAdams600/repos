import type { NextFunction, Request, Response } from "express";
import { env } from "./env.js";

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/** Gates internal endpoints the /agents service calls (heartbeat writes, lead-score writes). */
export function requireAgentsToken(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (token !== env.AGENTS_SERVICE_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/** Gates the founder dashboard API. Swap for real auth before adding a second founder/user. */
export function requireDashboardToken(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (token !== env.DASHBOARD_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
