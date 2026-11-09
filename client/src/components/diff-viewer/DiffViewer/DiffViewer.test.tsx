import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { DiffViewer } from "./DiffViewer";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(cleanup);

function bigFile(path: string, marker: string): PrFile {
  return {
    path,
    additions: AUTO_EXPAND_MAX_LINES + 1,
    deletions: 0,
    patch: `@@ -0,0 +1,1 @@\n+${marker}`,
  };
}

const SMALL: PrFile = {
  path: "src/small.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -0,0 +1,1 @@\n+small-line",
};
const BIG_B = bigFile("src/b.ts", "b-line");
const BIG_C = bigFile("src/c.ts", "c-line");

function renderViewer(files: PrFile[], focusPath?: string | null) {
  const ui = (path?: string | null) => (
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <DiffViewer files={files} focusPath={path} />
    </NextIntlClientProvider>
  );
  const view = render(ui(focusPath));
  return { rerenderWith: (path: string | null) => view.rerender(ui(path)) };
}

const LINES_FILE: PrFile = {
  path: "src/lines.ts",
  additions: AUTO_EXPAND_MAX_LINES + 1,
  deletions: 1,
  patch: "@@ -10,3 +10,4 @@\n ctx10\n-gone\n+add11\n+add12\n ctx13",
};
const NOTE = "Line 40 isn't part of this diff - showing the file";

function renderLines(file: PrFile, focusLines: { start: number; end: number } | null) {
  const ui = (lines: { start: number; end: number } | null) => (
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <DiffViewer files={[file]} focusPath={file.path} focusLines={lines} focusMissingNote={NOTE} />
    </NextIntlClientProvider>
  );
  const view = render(ui(focusLines));
  return { rerenderWith: (l: { start: number; end: number } | null) => view.rerender(ui(l)) };
}

const rowOf = (text: string) => screen.getByText(text).parentElement as HTMLElement;

describe("DiffViewer focusLines", () => {
  it("highlights the range, scrolls to and focuses the first line, then re-targets", () => {
    const { rerenderWith } = renderLines(LINES_FILE, { start: 11, end: 12 });

    expect(rowOf("add11")).toHaveAttribute("data-highlighted", "true");
    expect(rowOf("add12")).toHaveAttribute("data-highlighted", "true");
    expect(rowOf("ctx10")).not.toHaveAttribute("data-highlighted");
    expect(rowOf("ctx13")).not.toHaveAttribute("data-highlighted");
    expect(scrollIntoView.mock.contexts[0]).toBe(rowOf("add11"));
    expect(rowOf("add11")).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerenderWith({ start: 12, end: 12 });

    expect(rowOf("add11")).not.toHaveAttribute("data-highlighted");
    expect(rowOf("add12")).toHaveAttribute("data-highlighted", "true");
    expect(rowOf("add12")).toHaveFocus();
  });

  it("falls back to the file header with a note when the line is not rendered", () => {
    const noPatch: PrFile = { ...LINES_FILE, patch: null };
    // old-side numbers 21..23 exist only on removed rows (the only new-side number is 20)
    const removedOnly: PrFile = {
      path: "src/removed.ts",
      additions: 0,
      deletions: 3,
      patch: "@@ -20,4 +20,1 @@\n ctx20\n-gone21\n-gone22\n-gone23",
    };
    for (const [file, range] of [
      [LINES_FILE, { start: 40, end: 40 }],
      [LINES_FILE, { start: 10, end: 10 }],
      [noPatch, { start: 11, end: 11 }],
      [removedOnly, { start: 22, end: 22 }],
    ] as const) {
      cleanup();
      scrollIntoView.mockReset();
      renderLines(file, range);
      if (range.start === 10) {
        // a context line exists at 10: control case is highlighted, no note
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        continue;
      }
      expect(screen.getByRole("status")).toHaveTextContent(NOTE);
      expect(scrollIntoView.mock.contexts[0]).toHaveTextContent(file.path);
      expect(document.querySelector("[data-highlighted]")).toBeNull();
    }
  });
});

describe("DiffViewer focusPath", () => {
  it("expands and scrolls to the focused large file only", () => {
    renderViewer([SMALL, BIG_B], "src/b.ts");

    expect(screen.getByText("b-line")).toBeInTheDocument();
    expect(screen.getByText("small-line")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const header = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(header).toHaveTextContent("src/b.ts");
  });

  it("keeps today's behaviour without a (known) focusPath", () => {
    renderViewer([SMALL, BIG_B], "src/unknown.ts");

    expect(screen.getByText("small-line")).toBeInTheDocument();
    expect(screen.queryByText("b-line")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens the next focused file when focus moves without a remount", () => {
    const { rerenderWith } = renderViewer([BIG_B, BIG_C], "src/b.ts");
    expect(screen.getByText("b-line")).toBeInTheDocument();
    expect(screen.queryByText("c-line")).not.toBeInTheDocument();

    rerenderWith("src/c.ts");

    expect(screen.getByText("c-line")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    const header = scrollIntoView.mock.contexts[1] as HTMLElement;
    expect(header).toHaveTextContent("src/c.ts");
  });
});
