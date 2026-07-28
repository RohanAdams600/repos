import pino from "pino";

export const logger = pino({
  name: "autonoma-agents",
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
});
