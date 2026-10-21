import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourSectionCard } from "./TourSectionCard";

afterEach(cleanup);

describe("TourSectionCard", () => {
  it("shows the title and body, and the chevron collapses and expands it (AC-12)", async () => {
    const user = userEvent.setup();
    render(
      <TourSectionCard id="critical-paths" title="Critical paths" icon="Activity" collapseLabel="Collapse" expandLabel="Expand">
        <p>body text</p>
      </TourSectionCard>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Critical paths" })).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Collapse" });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("body text")).toBeVisible();

    await user.click(btn);
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("body text")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("body text")).toBeVisible();
  });
});
