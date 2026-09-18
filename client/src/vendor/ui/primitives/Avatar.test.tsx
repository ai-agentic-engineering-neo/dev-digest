import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Avatar } from "./Avatar";

afterEach(cleanup);

describe("Avatar", () => {
  it("renders initials from name when no imageUrl is given (existing callers, unchanged)", () => {
    const { container } = render(<Avatar name="marisa koch" size={18} />);
    expect(screen.getByText("MK")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders a real <img> when imageUrl is given", () => {
    render(<Avatar name="octocat" imageUrl="https://example.com/a.png" size={26} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("falls back to initials if the image fails to load", () => {
    render(<Avatar name="octocat" imageUrl="https://example.com/broken.png" size={26} />);
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(screen.getByText("O")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("falls back to a neutral initial when name is '?' (no connected GitHub user)", () => {
    render(<Avatar name="?" size={26} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
