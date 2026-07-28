/**
 * Runs before each test file's module graph loads, so env.ts's
 * process.env-reading zod parse (which happens at import time) sees a
 * valid, minimal, mock-mode configuration by default. Individual tests
 * that need different env values should test envSchema directly instead
 * of mutating process.env here — see src/lib/env.test.ts.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/autonoma_test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.PAYMENTS_MODE = "mock";
process.env.CHECKOUT_SUCCESS_URL = "http://localhost:3000/waitlist/success";
process.env.CHECKOUT_CANCEL_URL = "http://localhost:3000/waitlist";
process.env.AGENTS_SERVICE_TOKEN = "test-agents-token";
process.env.DASHBOARD_TOKEN = "test-dashboard-token";
