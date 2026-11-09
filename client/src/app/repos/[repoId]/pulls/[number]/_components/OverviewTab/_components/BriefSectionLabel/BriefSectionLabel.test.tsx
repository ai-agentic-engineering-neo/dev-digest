import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BriefSectionLabel } from "./BriefSectionLabel";

describe("BriefSectionLabel", () => {
  it("renders an uppercase heading with a hidden icon and a count badge instead of '(n)'", () => {
    render(
      <BriefSectionLabel icon="ListChecks" id="focus" count={3}>
        Review focus
      </BriefSectionLabel>,
    );

    const heading = screen.getByRole("heading", { name: /review focus/i });
    expect(heading).toHaveAttribute("id", "focus");
    expect(within(heading).getByText("Review focus")).toHaveStyle({ textTransform: "uppercase" });
    expect(within(heading).getByText("3")).toBeInTheDocument();
    expect(heading).not.toHaveTextContent("(3)");
    expect(heading.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("omits the badge without a count", () => {
    render(<BriefSectionLabel icon="Sparkles">PR Brief</BriefSectionLabel>);
    expect(screen.getByRole("heading")).toHaveTextContent(/^PR Brief$/);
  });
});
