import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../_test/harness";
import { InjectionBadge } from "./InjectionBadge";

afterEach(cleanup);

describe("InjectionBadge", () => {
  it("shows the label by default", () => {
    renderWithProviders(<InjectionBadge />);
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
  });

  it("compact mode keeps an accessible name but no visible text", () => {
    renderWithProviders(<InjectionBadge compact />);
    const badge = screen.getByRole("img", { name: "Injection detected" });
    expect(badge).toHaveTextContent("");
    expect(screen.queryByText("Injection detected")).not.toBeInTheDocument();
  });

  it("accepts a caller-supplied label and tooltip", () => {
    renderWithProviders(<InjectionBadge label="Blocked" title="why" />);
    expect(screen.getByText("Blocked").closest("[title]")).toHaveAttribute("title", "why");
  });
});
