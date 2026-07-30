import { beforeEach, describe, expect, it, vi } from "vitest";

// Deliberately overrides SUBSCRIPTION_TIER away from test/setup.ts's
// "core" default, in its own file so the module-level env override
// doesn't leak into heartbeat.test.ts (each test file gets its own
// module registry in vitest, which is what makes this safe).
process.env.SUBSCRIPTION_TIER = "starter";

const profileMock = vi.hoisted(() => ({ loadProfile: vi.fn() }));
vi.mock("./lib/profile.js", () => profileMock);

const stateMock = vi.hoisted(() => ({ canProcessOneMore: vi.fn(() => true) }));
vi.mock("./lib/state.js", () => stateMock);

const frontDeskMock = vi.hoisted(() => ({ runFrontDesk: vi.fn().mockResolvedValue({ processed: 1 }) }));
vi.mock("./lanes/front-desk.js", () => frontDeskMock);

const salesLedgerMock = vi.hoisted(() => ({ runSalesLedger: vi.fn().mockResolvedValue({ processed: 1 }) }));
vi.mock("./lanes/sales-ledger.js", () => salesLedgerMock);

const backOfficeMock = vi.hoisted(() => ({ runBackOffice: vi.fn().mockResolvedValue({ processed: 1 }) }));
vi.mock("./lanes/back-office.js", () => backOfficeMock);

const nightReportMock = vi.hoisted(() => ({ maybeWriteNightlyReport: vi.fn() }));
vi.mock("./lanes/night-report.js", () => nightReportMock);

const { runCycle } = await import("./heartbeat.js");

const PROFILE = { businessName: "Test Co", hours: "9-5", services: "stuff", pricingNotes: "", tone: "friendly", contactEmail: "a@b.com", contactPhone: "555" };

describe("runCycle on the starter tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileMock.loadProfile.mockReturnValue(PROFILE);
  });

  it("runs only front-desk — sales-ledger, back-office, and night-report are all above starter's ceiling", async () => {
    await runCycle();
    expect(frontDeskMock.runFrontDesk).toHaveBeenCalledWith(PROFILE, "starter");
    expect(salesLedgerMock.runSalesLedger).not.toHaveBeenCalled();
    expect(backOfficeMock.runBackOffice).not.toHaveBeenCalled();
    expect(nightReportMock.maybeWriteNightlyReport).not.toHaveBeenCalled();
  });
});
