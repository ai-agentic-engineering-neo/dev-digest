import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocusCard } from "./ReviewFocusCard";

afterEach(cleanup);

function renderCard(items: { path: string; line: number | null; reason: string }[], onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocusCard items={items} onOpen={onOpen} />
    </NextIntlClientProvider>,
  );
  return onOpen;
}

describe("ReviewFocusCard", () => {
  it("lists rows in model order with a count and opens the diff at the row's place", async () => {
    const user = userEvent.setup();
    const open = renderCard([
      { path: "src/b.ts", line: 4, reason: "Second file first" },
      { path: "src/a.ts", line: null, reason: "No single line" },
    ]);
    expect(screen.getByText("2")).toBeInTheDocument();
    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("Open src/b.ts:4 in Files changed");
    expect(rows[1]).toHaveAccessibleName("Open src/a.ts in Files changed");

    await user.click(rows[0]!);
    expect(open).toHaveBeenCalledWith("src/b.ts", 4);
    await user.click(rows[1]!);
    expect(open).toHaveBeenLastCalledWith("src/a.ts", null);
  });

  it("shows an explicit note when nothing survived verification", () => {
    renderCard([]);
    expect(screen.getByText(/Nothing in particular to flag/)).toBeInTheDocument();
  });
});
