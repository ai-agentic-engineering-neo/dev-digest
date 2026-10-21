import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourCommandRow } from "./TourCommandRow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TourCommandRow", () => {
  it("copies exactly the command and confirms on that row (AC-17)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TourCommandRow index={2} command="pnpm dev" note="starts the API" copyLabel="Copy command" copiedLabel="Copied" />);
    expect(screen.getByText("starts the API")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy command: pnpm dev" }));
    expect(writeText).toHaveBeenCalledWith("pnpm dev");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("shows no confirmation when the Clipboard API is missing (EC-17)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {});
    render(<TourCommandRow index={1} command="pnpm dev" copyLabel="Copy command" copiedLabel="Copied" />);
    await user.click(screen.getByRole("button", { name: /Copy command/ }));
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
});
