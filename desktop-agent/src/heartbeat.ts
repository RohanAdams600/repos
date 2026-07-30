import cron from "node-cron";
import { env } from "./config/env.js";
import { tierConfig, isLaneEnabled } from "./config/tiers.js";
import { loadProfile } from "./lib/profile.js";
import { canProcessOneMore } from "./lib/state.js";
import { logger } from "./lib/logger.js";
import { runFrontDesk } from "./lanes/front-desk.js";
import { runSalesLedger } from "./lanes/sales-ledger.js";
import { runBackOffice } from "./lanes/back-office.js";
import { maybeWriteNightlyReport } from "./lanes/night-report.js";

/**
 * One cycle: run every capability lane this tier unlocks, in order,
 * stopping lane work early the moment the shared daily cap is hit.
 * Night Report runs regardless of remaining capacity — it only reads
 * data/state.json, it never spends capacity itself.
 */
export async function runCycle(): Promise<void> {
  const profile = loadProfile();
  if (!profile) {
    logger.warn("no business profile on disk — run the setup wizard before the heartbeat can do anything");
    return;
  }

  const tier = env.SUBSCRIPTION_TIER;
  const config = tierConfig(tier);
  logger.info({ tier: config.label, lanes: config.capabilityLanes }, "heartbeat: cycle start");

  // A whole cycle failing (a filesystem hiccup, a bug in one lane) must
  // not kill the process the way an uncaught rejection would — this is
  // a long-running local daemon on someone's own machine with nobody
  // watching it the way a hosted service would be, so it has to survive
  // its own failures and just try again next cycle.
  try {
    if (!canProcessOneMore(tier)) {
      logger.info(
        { cap: config.dailyTaskCap },
        "heartbeat: daily task cap already reached, skipping lane work this cycle"
      );
    } else {
      if (isLaneEnabled(tier, "front-desk")) await runFrontDesk(profile, tier);
      if (isLaneEnabled(tier, "sales-ledger")) await runSalesLedger(profile, tier);
      if (isLaneEnabled(tier, "back-office")) await runBackOffice(profile, tier);
    }

    if (isLaneEnabled(tier, "night-report")) maybeWriteNightlyReport();
  } catch (err) {
    logger.error({ err }, "heartbeat: cycle failed — will try again next cycle");
  }

  logger.info("heartbeat: cycle complete");
}

export function startHeartbeatLoop(): void {
  const cronExpression = `*/${env.HEARTBEAT_INTERVAL_MINUTES} * * * *`;
  logger.info({ cronExpression, tier: env.SUBSCRIPTION_TIER }, "heartbeat: scheduling");
  void runCycle();
  cron.schedule(cronExpression, () => {
    void runCycle();
  });
}
