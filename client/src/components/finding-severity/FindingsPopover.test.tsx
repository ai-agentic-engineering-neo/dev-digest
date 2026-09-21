import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { FindingsPopover } from "./FindingsPopover";
import { finding } from "./fixtures.test-utils";

afterEach(cleanup);

function renderPopover(props: Partial<React.ComponentProps<typeof FindingsPopover>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <FindingsPopover
        variant="list"
        count={2}
        findings={[
          finding({ id: "w", severity: "WARNING", category: "perf", title: "N+1 query in user list endpoint", file: "src/api/users.ts", start_line: 45, end_line: 52, confidence: 0.86, rationale: "Loop issues one query per user." }),
          finding({ id: "c" }),
        ]}
        {...props}
      >
        <span>icons</span>
      </FindingsPopover>
    </NextIntlClientProvider>,
  );
}

describe("FindingsPopover", () => {
  it("is closed until hovered", () => {
    renderPopover();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hover shows the title and read-only previews (no buttons), critical first", () => {
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("icons"));
    const dialog = screen.getByRole("dialog", { name: "2 findings in this run" });
    const titles = within(dialog).getAllByText(/Hardcoded Stripe|N\+1 query/).map((n) => n.textContent);
    expect(titles).toEqual(["Hardcoded Stripe secret key in commit", "N+1 query in user list endpoint"]);
    expect(within(dialog).getByText("src/config.ts:12")).toBeInTheDocument();
    expect(within(dialog).getByText("98% conf")).toBeInTheDocument();
    expect(within(dialog).getByText("security")).toBeInTheDocument();
    expect(within(dialog).getByText(/literal sk_live_ Stripe secret key/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button")).not.toBeInTheDocument();
  });

  it("timeline variant uses the short title; opening notifies the lazy loader", () => {
    const onOpen = vi.fn();
    renderPopover({ variant: "run", count: 1, findings: undefined, isLoading: true, onOpen });
    fireEvent.mouseEnter(screen.getByText("icons"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "1 finding" })).toHaveTextContent("Loading findings…");
  });

  it("clicks inside do not bubble to the row underneath", () => {
    const rowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <div onClick={rowClick}>
          <FindingsPopover variant="list" count={1} findings={[finding({})]}>
            <span>icons</span>
          </FindingsPopover>
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("icons"));
    fireEvent.mouseEnter(screen.getByText("icons"));
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("Escape closes it", () => {
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("icons"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("scrolling inside the panel keeps it open; scrolling the page closes it", () => {
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("icons"));
    fireEvent.scroll(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
