import { describe, expect, it } from "vitest";
import { envSchema } from "./env.js";

const baseValidEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  AGENTS_SERVICE_TOKEN: "token",
  DASHBOARD_TOKEN: "token",
};

describe("envSchema", () => {
  it("accepts a minimal config and defaults PAYMENTS_MODE to mock", () => {
    const result = envSchema.safeParse(baseValidEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PAYMENTS_MODE).toBe("mock");
    }
  });

  it("does not require any Stripe vars in mock mode", () => {
    const result = envSchema.safeParse({ ...baseValidEnv, PAYMENTS_MODE: "mock" });
    expect(result.success).toBe(true);
  });

  it("rejects live mode with no Stripe vars set", () => {
    const result = envSchema.safeParse({ ...baseValidEnv, PAYMENTS_MODE: "live" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("STRIPE_SECRET_KEY");
      expect(paths).toContain("STRIPE_PRICE_CORE_MONTHLY");
    }
  });

  it("accepts live mode once all required Stripe vars are present", () => {
    const result = envSchema.safeParse({
      ...baseValidEnv,
      PAYMENTS_MODE: "live",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRICE_DEPOSIT: "price_x",
      STRIPE_PRICE_STARTER_MONTHLY: "price_x",
      STRIPE_PRICE_CORE_MONTHLY: "price_x",
      STRIPE_PRICE_SCALE_MONTHLY: "price_x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing DATABASE_URL regardless of payments mode", () => {
    const { DATABASE_URL: _drop, ...rest } = baseValidEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
