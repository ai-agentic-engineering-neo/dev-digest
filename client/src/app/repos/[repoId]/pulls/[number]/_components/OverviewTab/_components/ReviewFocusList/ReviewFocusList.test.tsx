import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BriefFocusItem } from "@/lib/types";
import { ReviewFocusList } from "./ReviewFocusList";

afterEach(cleanup);

const ITEMS: BriefFocusItem[] = [
  { file: "src/config.ts", line: 12, file_level: false, in_diff: true, reason: "Changes the default <b>limit</b>" },
  { file: "bin/logo.png", line: 1, file_level: true, in_diff: true, reason: "Binary asset" },
  { file: "lib/x.ts", line: 77, file_level: false, in_diff: false, reason: "Caller of changed symbol" },
];

function renderList(items: BriefFocusItem[], onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocusList items={items} repoFullName="acme/app" linkSha="idx1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("ReviewFocusList", () => {
  it("lists items in order, omits the line for file-level items and routes clicks", () => {
    const onOpenFile = renderList(ITEMS);
    expect(screen.getByRole("heading", { name: "Review focus — read these first (3)" })).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("src/config.ts:12 — Changes the default <b>limit</b>");
    expect(rows[0]!.querySelector("b")).toBeNull(); // AC-14: rendered as text, not HTML
    expect(rows[1]).toHaveTextContent("bin/logo.png — Binary asset");
    expect(rows[1]).not.toHaveTextContent("bin/logo.png:1");
    expect(rows[2]).toHaveTextContent("lib/x.ts:77");

    fireEvent.click(screen.getByRole("button", { name: /src\/config.ts:12/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/config.ts");

    expect(screen.getByRole("link", { name: /lib\/x.ts:77/ })).toHaveAttribute(
      "href",
      githubBlobUrl("acme/app", "idx1", "lib/x.ts", 77),
    );
  });

  it("shows the empty message", () => {
    renderList([]);
    expect(screen.getByText("No review focus items.")).toBeInTheDocument();
  });
});
