import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Topbar } from "./Topbar";
import type { ShellContext } from "./types";

afterEach(cleanup);

function ctx(overrides: Partial<ShellContext> = {}): ShellContext {
  return { ...overrides };
}

describe("Topbar — account avatar", () => {
  it("falls back to a neutral '?' when no GitHub user is connected", () => {
    render(<Topbar ctx={ctx({ githubUser: null })} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows the connected GitHub user's real avatar image when present", () => {
    render(
      <Topbar
        ctx={ctx({ githubUser: { login: "octocat", avatarUrl: "https://example.com/a.png" } })}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("falls back to the login's initial when connected but no avatar URL", () => {
    render(<Topbar ctx={ctx({ githubUser: { login: "octocat", avatarUrl: null } })} />);
    expect(screen.getByText("O")).toBeInTheDocument();
  });
});
