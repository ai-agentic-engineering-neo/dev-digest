import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastChips } from "./BlastChips";
import { MAX_CHIPS } from "./constants";

afterEach(() => {
  cleanup();
});

describe("BlastChips", () => {
  it("toggles the hidden chips and exposes the expanded state", () => {
    const items = Array.from({ length: MAX_CHIPS + 2 }, (_, i) => `GET /api/r${i}`);
    render(
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastChips kind="endpoint" label="Endpoints affected" items={items} />
      </NextIntlClientProvider>,
    );
    const toggle = screen.getByRole("button", { name: "+2 more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(`GET /api/r${MAX_CHIPS + 1}`)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`GET /api/r${MAX_CHIPS + 1}`)).toBeInTheDocument();
  });
});
