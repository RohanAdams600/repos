/**
 * Runs before each test file's module graph loads, so config/env.ts's
 * process.env-reading zod parse (which happens at import time) sees a
 * valid, minimal configuration by default.
 */
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
process.env.BACKEND_BASE_URL = "http://localhost:4000";
process.env.AGENTS_SERVICE_TOKEN = "test-agents-token";
process.env.HEARTBEAT_INTERVAL_MINUTES = "15";
process.env.TRUST_STAGE = "manual";
process.env.HEARTBEAT_ALERT_CHANNEL = "";
process.env.SLACK_ALERT_WEBHOOK_URL = "";
