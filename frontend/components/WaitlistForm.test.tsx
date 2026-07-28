import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock only the two network calls; keep the real ApiError class so
// `err instanceof ApiError` inside the component still resolves correctly.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, submitWaitlist: vi.fn(), createDepositCheckout: vi.fn() };
});

const apiMock = await import("@/lib/api");
const { ApiError } = apiMock;
const mockedSubmitWaitlist = vi.mocked(apiMock.submitWaitlist);
const mockedCreateDepositCheckout = vi.mocked(apiMock.createDepositCheckout);
const { WaitlistForm } = await import("./WaitlistForm");

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/work email/i), "owner@acme.com");
  await user.type(screen.getByLabelText(/business name/i), "Acme Services LLC");
  await user.selectOptions(screen.getByLabelText(/monthly revenue/i), "80k_250k");
  await user.selectOptions(screen.getByLabelText(/team size/i), "5_20");
  await user.type(
    screen.getByLabelText(/eating the most of your week/i),
    "Manually following up with every inbound lead"
  );
}

describe("WaitlistForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the pre-qualification payload and shows the deposit CTA on success", async () => {
    const user = userEvent.setup();
    mockedSubmitWaitlist.mockResolvedValue({ id: "lead-1", email: "owner@acme.com" });

    render(<WaitlistForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    await waitFor(() => expect(mockedSubmitWaitlist).toHaveBeenCalledOnce());
    expect(mockedSubmitWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@acme.com", businessName: "Acme Services LLC", tierInterest: "core" })
    );
    expect(await screen.findByText(/you're on the list/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve with a \$200 deposit/i })).toBeInTheDocument();
  });

  it("shows the API's error message when the submission fails", async () => {
    const user = userEvent.setup();
    mockedSubmitWaitlist.mockRejectedValue(new ApiError("Couldn't submit the waitlist form.", 400));

    render(<WaitlistForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(await screen.findByText(/couldn't submit the waitlist form/i)).toBeInTheDocument();
  });

  it("kicks off the deposit checkout after a successful waitlist submission", async () => {
    const user = userEvent.setup();
    mockedSubmitWaitlist.mockResolvedValue({ id: "lead-1", email: "owner@acme.com" });
    mockedCreateDepositCheckout.mockResolvedValue({ url: "http://localhost:4000/mock-checkout", mock: true });

    render(<WaitlistForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    await screen.findByText(/you're on the list/i);

    await user.click(screen.getByRole("button", { name: /reserve with a \$200 deposit/i }));

    await waitFor(() => expect(mockedCreateDepositCheckout).toHaveBeenCalledWith("owner@acme.com"));
  });
});
