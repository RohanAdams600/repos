import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => ({ loadProfile: vi.fn() }));
vi.mock("./lib/profile.js", () => profileMock);

const stateMock = vi.hoisted(() => ({ canProcessOneMore: vi.fn() }));
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

describe("runCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileMock.loadProfile.mockReturnValue(PROFILE);
    stateMock.canProcessOneMore.mockReturnValue(true);
  });

  it("does nothing if no business profile has been saved yet", async () => {
    profileMock.loadProfile.mockReturnValue(null);
    await runCycle();
    expect(frontDeskMock.runFrontDesk).not.toHaveBeenCalled();
  });

  it("test setup runs the core tier — front-desk, sales-ledger, back-office, but not night-report", async () => {
    await runCycle();
    expect(frontDeskMock.runFrontDesk).toHaveBeenCalledWith(PROFILE, "core");
    expect(salesLedgerMock.runSalesLedger).toHaveBeenCalledWith(PROFILE, "core");
    expect(backOfficeMock.runBackOffice).toHaveBeenCalledWith(PROFILE, "core");
    expect(nightReportMock.maybeWriteNightlyReport).not.toHaveBeenCalled();
  });

  it("skips all lane work when the daily cap is already reached, but still checks the night report", async () => {
    stateMock.canProcessOneMore.mockReturnValue(false);
    await runCycle();
    expect(frontDeskMock.runFrontDesk).not.toHaveBeenCalled();
    expect(salesLedgerMock.runSalesLedger).not.toHaveBeenCalled();
    expect(backOfficeMock.runBackOffice).not.toHaveBeenCalled();
  });
});
