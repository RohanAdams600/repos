import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  name: "autonoma-backend",
  level: process.env.LOG_LEVEL ?? "info",
  transport: env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
});
