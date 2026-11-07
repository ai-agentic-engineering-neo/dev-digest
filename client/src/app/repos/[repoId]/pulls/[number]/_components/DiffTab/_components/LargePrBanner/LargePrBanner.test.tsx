import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LargePrBanner } from "./LargePrBanner";

describe("LargePrBanner", () => {
  it("shows title and body in a note", () => {
    render(<LargePrBanner title="Large PR" body="Consider splitting it." />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Large PR");
    expect(note).toHaveTextContent("Consider splitting it.");
  });
});
