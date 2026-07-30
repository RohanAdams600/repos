import pino from "pino";

export const logger = pino({
  name: "night-desk-agent",
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.LOG_LEVEL === "silent" ? undefined : { target: "pino-pretty" },
});
