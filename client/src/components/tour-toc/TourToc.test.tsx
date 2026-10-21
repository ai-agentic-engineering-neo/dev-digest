import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourToc } from "./TourToc";

afterEach(cleanup);

describe("TourToc", () => {
  it("lists the items as anchors, marks the active one and reports a click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TourToc
        title="On this page"
        items={[
          { id: "architecture", label: "Architecture overview" },
          { id: "critical-paths", label: "Critical paths" },
        ]}
        activeId="critical-paths"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole("link", { name: "Critical paths" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Architecture overview" })).toHaveAttribute("href", "#architecture");
    await user.click(screen.getByRole("link", { name: "Architecture overview" }));
    expect(onSelect).toHaveBeenCalledWith("architecture");
  });
});
