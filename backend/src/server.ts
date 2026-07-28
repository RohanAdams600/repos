import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, paymentsMode: env.PAYMENTS_MODE }, "Autonoma backend listening");
});
