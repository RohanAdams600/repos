import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const paramsMock = vi.hoisted(() => new Map<string, string>());
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => paramsMock.get(key) ?? null }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, resolveAgentDownload: vi.fn() };
});

const apiMock = await import("@/lib/api");
const mockedResolveAgentDownload = vi.mocked(apiMock.resolveAgentDownload);
const { WaitlistSuccessContent } = await import("./WaitlistSuccessContent");

describe("WaitlistSuccessContent — deposit flow", () => {
  beforeEach(() => {
    paramsMock.clear();
    vi.clearAllMocks();
  });

  it("shows the deposit success message when there's no subscription kind", () => {
    render(<WaitlistSuccessContent />);
    expect(screen.getByText(/deposit received/i)).toBeInTheDocument();
  });

  it("shows the demo-mode note when mock=1", () => {
    paramsMock.set("mock", "1");
    render(<WaitlistSuccessContent />);
    expect(screen.getByText(/demo mode/i)).toBeInTheDocument();
  });
});

describe("WaitlistSuccessContent — subscription flow", () => {
  beforeEach(() => {
    paramsMock.clear();
    vi.clearAllMocks();
    paramsMock.set("kind", "subscription");
    paramsMock.set("session_id", "sess_123");
    paramsMock.set("tier", "core");
  });

  it("resolves the session to a download and shows the tier's unlocked lanes", async () => {
    mockedResolveAgentDownload.mockResolvedValue({ token: "tok_abc", tier: "core" });

    render(<WaitlistSuccessContent />);

    expect(mockedResolveAgentDownload).toHaveBeenCalledWith("sess_123");
    expect(await screen.findByRole("link", { name: /download your agent/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/downloads/agent/tok_abc")
    );
    expect(screen.getByText("Front Desk")).toBeInTheDocument();
    expect(screen.getByText("Back Office")).toBeInTheDocument();
    expect(screen.queryByText("Night Report")).not.toBeInTheDocument(); // core doesn't unlock this
  });

  it("shows an error state if the download can't be resolved", async () => {
    mockedResolveAgentDownload.mockRejectedValue(new Error("not found"));

    render(<WaitlistSuccessContent />);

    expect(await screen.findByText(/couldn't find your download/i)).toBeInTheDocument();
  });
});
