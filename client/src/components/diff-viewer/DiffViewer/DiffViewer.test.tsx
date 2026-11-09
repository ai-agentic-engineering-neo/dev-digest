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
