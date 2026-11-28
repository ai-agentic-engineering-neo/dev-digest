import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

const file = (path: string, line: string): PrFile => ({
  path,
  additions: 1,
  deletions: 0,
  patch: `@@ -0,0 +1,1 @@\n+${line}`,
});

function wrap(files: PrFile[]) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <DiffViewer files={files} />
    </NextIntlClientProvider>
  );
}

describe("DiffViewer", () => {
  it("keeps a file's collapsed state when another file is inserted before it", () => {
    const a = file("src/a.ts", "const a = 1;");
    const b = file("src/b.ts", "const b = 2;");
    const { rerender } = render(wrap([a, b]));

    // Small files start expanded; collapse src/a.ts.
    expect(screen.getByText("const a = 1;")).toBeTruthy();
    fireEvent.click(screen.getByText("src/a.ts"));
    expect(screen.queryByText("const a = 1;")).toBeNull();

    // A new file appears at the top: state must follow the path, not the index.
    rerender(wrap([file("src/new.ts", "const n = 0;"), a, b]));
    expect(screen.queryByText("const a = 1;")).toBeNull();
    expect(screen.getByText("const n = 0;")).toBeTruthy();
    expect(screen.getByText("const b = 2;")).toBeTruthy();
  });
});
