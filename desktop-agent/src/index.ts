import { hasApiKey } from "./config/env.js";
import { profileExists } from "./lib/profile.js";
import { startWizard } from "./wizard/server.js";
import { startHeartbeatLoop } from "./heartbeat.js";
import { logger } from "./lib/logger.js";

function main(): void {
  if (!profileExists() || !hasApiKey()) {
    logger.info("First run — starting the setup wizard. Open the URL below in your browser.");
    startWizard();
    return;
  }

  logger.info("Setup found — starting the agent.");
  startHeartbeatLoop();
}

main();
