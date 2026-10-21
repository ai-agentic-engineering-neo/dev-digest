import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourPathRow } from "./TourPathRow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TourPathRow", () => {
  let open: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal("open", open);
  });

  it("opens the GitHub blob at the default branch in a new tab without opener (AC-40)", async () => {
    const user = userEvent.setup();
    render(
      <TourPathRow
        path="src/server.ts"
        why="bootstrap"
        repo={{ full_name: "acme/payments-api", default_branch: "main" }}
        openLabel="Open"
        copiedLabel="Copied"
      />,
    );
    expect(screen.getByText(/bootstrap/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open src\/server.ts/ }));
    expect(open).toHaveBeenCalledWith(
      "https://github.com/acme/payments-api/blob/main/src/server.ts",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("without a repo, Open copies the path and confirms (AC-41)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TourPathRow path="src/a.ts" openLabel="Open" copiedLabel="Copied" />);
    await user.click(screen.getByRole("button", { name: /Open src\/a.ts/ }));
    expect(writeText).toHaveBeenCalledWith("src/a.ts");
    expect(open).not.toHaveBeenCalled();
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
