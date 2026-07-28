import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startHeartbeat, runHeartbeat } from "./heartbeat/scheduler.js";
import { closeDb } from "./lib/db.js";

async function main(): Promise<void> {
  logger.info(
    { trustStage: env.TRUST_STAGE, heartbeatMinutes: env.HEARTBEAT_INTERVAL_MINUTES },
    "Kai orchestrator starting"
  );

  startHeartbeat();

  // Run one heartbeat cycle immediately on boot so the dashboard has data
  // without waiting for the first cron tick.
  await runHeartbeat();
}

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down");
  await closeDb();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down");
  await closeDb();
  process.exit(0);
});

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
