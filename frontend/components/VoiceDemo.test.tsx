import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoiceDemo } from "./VoiceDemo";

// NEXT_PUBLIC_VAPI_PUBLIC_KEY / NEXT_PUBLIC_VAPI_ASSISTANT_ID_DEMO are
// unset in the test environment (test/setup.ts doesn't set them and
// nothing else should) — this is exactly the "not configured yet" state
// the widget needs to degrade gracefully in, since that's the default for
// anyone who hasn't wired up Vapi.
describe("VoiceDemo", () => {
  it("shows a disabled 'coming soon' state instead of a broken call button when unconfigured", () => {
    render(<VoiceDemo />);

    expect(screen.getByText(/voice demo coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /talk to autonoma/i })).not.toBeInTheDocument();
  });
});
