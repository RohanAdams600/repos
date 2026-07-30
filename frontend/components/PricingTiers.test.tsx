import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingTiers } from "./PricingTiers";

describe("PricingTiers", () => {
  it("renders all three decoy-pricing tiers with the correct prices", () => {
    render(<PricingTiers />);

    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("$4,000")).toBeInTheDocument();
    expect(screen.getByText("$20,000")).toBeInTheDocument();
  });

  it("marks Core — the actual target offer — as the featured tier", () => {
    render(<PricingTiers />);

    expect(screen.getByText("Most clients choose this")).toBeInTheDocument();
  });

  it("never quotes Core in isolation — Starter and Scale always render alongside it", () => {
    render(<PricingTiers />);

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Scale")).toBeInTheDocument();
  });
});
