import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocSourceBadge } from "./DocSourceBadge";

describe("DocSourceBadge", () => {
  it("renders the label in its source colour", () => {
    render(<DocSourceBadge source="docs" label="docs" />);
    expect(screen.getByText("docs")).toHaveStyle({ color: "var(--ok)" });
  });

  it("uses a different colour per source", () => {
    render(
      <>
        <DocSourceBadge source="specs" label="specs" />
        <DocSourceBadge source="devdigest" label="devdigest" />
      </>,
    );
    expect(screen.getByText("specs")).toHaveStyle({ color: "var(--accent-text)" });
    expect(screen.getByText("devdigest")).toHaveStyle({ color: "var(--viz-5)" });
  });
});
