import pino from "pino";

export const logger = pino({
  name: "autonoma-desktop-agent",
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.LOG_LEVEL === "silent" ? undefined : { target: "pino-pretty" },
});
