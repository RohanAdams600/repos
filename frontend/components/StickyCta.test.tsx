import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StickyCta } from "./StickyCta";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  fireEvent.scroll(window);
}

describe("StickyCta", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    scrollTo(0);
  });

  it("stays hidden before the scroll threshold", () => {
    render(<StickyCta />);
    expect(screen.queryByRole("link", { name: /reserve your spot/i })).not.toBeInTheDocument();
  });

  it("appears after scrolling past the threshold", () => {
    render(<StickyCta />);
    scrollTo(1000);
    expect(screen.getByRole("link", { name: /reserve your spot/i })).toBeInTheDocument();
  });

  it("dismissing hides it and remembers the choice for the session", () => {
    render(<StickyCta />);
    scrollTo(1000);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByRole("link", { name: /reserve your spot/i })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("autonoma-sticky-cta-dismissed")).toBe("1");
  });

  it("stays dismissed across a remount within the same session", () => {
    window.sessionStorage.setItem("autonoma-sticky-cta-dismissed", "1");
    render(<StickyCta />);
    scrollTo(1000);
    expect(screen.queryByRole("link", { name: /reserve your spot/i })).not.toBeInTheDocument();
  });
});
