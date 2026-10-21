import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Gallery } from "../components/showcase";
import { DiffViewer } from "../components/diff-viewer";
import type { PrFile } from "../lib/types";
import shellMessages from "../../messages/en/shell.json";
import contextMessages from "../../messages/en/context.json";

afterEach(cleanup);

const themes: ("dark" | "light")[] = ["dark", "light"];

describe("web smoke (both themes)", () => {
  themes.forEach((theme) => {
    it(`component gallery renders in ${theme}`, () => {
      render(
        <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
          <div data-theme={theme}>
            <Gallery />
          </div>
        </NextIntlClientProvider>
      );
      // a few representative components are present
      expect(screen.getAllByText("Primary").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
      // project context group: a missing and a too-large badge, an approximate token count
      expect(screen.getAllByText("missing").length).toBeGreaterThan(0);
      expect(screen.getAllByText("too large").length).toBeGreaterThan(0);
      expect(screen.getAllByText("≈ 24000 tokens").length).toBeGreaterThan(0);
      // modified locally: the badge and the row marker with its text alternative
      expect(screen.getAllByText("Modified locally").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("img", { name: "Modified locally" }).length).toBeGreaterThan(0);
      // onboarding tour group: a card, the TOC and a fenced Markdown block
      expect(screen.getAllByRole("heading", { name: "Critical paths" }).length).toBeGreaterThan(0);
      expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    });
  });

  it("diff viewer parses a unified patch", () => {
    const files: PrFile[] = [
      {
        path: "src/config.ts",
        additions: 2,
        deletions: 1,
        patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
      },
    ];
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <DiffViewer files={files} />
        </div>
      </NextIntlClientProvider>
    );
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
  });
});
