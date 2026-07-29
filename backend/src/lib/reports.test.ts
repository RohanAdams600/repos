import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ pool: { query: vi.fn() } }));
vi.mock("./db.js", () => dbMock);

const emailMock = vi.hoisted(() => ({ notifyFounder: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./email.js", () => emailMock);

const { maybeSendNightlyReport } = await import("./reports.js");

function mockCountQueries(insertRowCount: number) {
  dbMock.pool.query.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO nightly_reports")) {
      return Promise.resolve({ rowCount: insertRowCount, rows: [] });
    }
    if (sql.includes("FILTER")) {
      return Promise.resolve({ rows: [{ completed: "3", failed: "1" }] });
    }
    return Promise.resolve({ rows: [{ n: "2" }] });
  });
}

describe("maybeSendNightlyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not send before the report hour", async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 14, 0, 0)); // 2pm
    mockCountQueries(1);

    const result = await maybeSendNightlyReport();

    expect(result.sent).toBe(false);
    expect(dbMock.pool.query).not.toHaveBeenCalled();
    expect(emailMock.notifyFounder).not.toHaveBeenCalled();
  });

  it("compiles and sends once past the report hour", async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 21, 0, 0)); // 9pm
    mockCountQueries(1); // insert claims the day (rowCount 1)

    const result = await maybeSendNightlyReport();

    expect(result.sent).toBe(true);
    expect(emailMock.notifyFounder).toHaveBeenCalledOnce();
    const [subject, body] = emailMock.notifyFounder.mock.calls[0];
    expect(subject).toContain("Nightly Report");
    expect(body).toContain("Agent tasks completed: 3");
    expect(body).toContain("Agent tasks failed: 1");
  });

  it("does not send twice for the same day — the insert is the atomic claim", async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 21, 0, 0));
    mockCountQueries(0); // ON CONFLICT DO NOTHING -> another caller already claimed today

    const result = await maybeSendNightlyReport();

    expect(result.sent).toBe(false);
    expect(emailMock.notifyFounder).not.toHaveBeenCalled();
  });
});
