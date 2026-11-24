import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

const fileA: PrFile = { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+alpha line" };
const fileB: PrFile = { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+beta line" };

function wrap(files: PrFile[]) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <DiffViewer files={files} />
    </NextIntlClientProvider>
  );
}

describe("DiffViewer keys", () => {
  afterEach(cleanup);

  it("keeps a collapsed file collapsed when files are reordered or filtered", () => {
    const { rerender } = render(wrap([fileA, fileB]));
    // Both small files auto-expand.
    expect(screen.getByText("alpha line")).toBeTruthy();
    expect(screen.getByText("beta line")).toBeTruthy();

    // Collapse A via its header.
    fireEvent.click(screen.getByText("src/a.ts"));
    expect(screen.queryByText("alpha line")).toBeNull();

    // Reorder: A stays collapsed, B stays open (index keys would swap them).
    rerender(wrap([fileB, fileA]));
    expect(screen.queryByText("alpha line")).toBeNull();
    expect(screen.getByText("beta line")).toBeTruthy();

    // Filter A out and back in at the front: B keeps its own (open) state.
    rerender(wrap([fileB]));
    expect(screen.getByText("beta line")).toBeTruthy();
  });

  it("renders files sharing a path without duplicate-key warnings", () => {
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      render(wrap([fileA, { ...fileA }]));
    } finally {
      console.error = orig;
    }
    expect(screen.getAllByText("src/a.ts")).toHaveLength(2);
    expect(errors.filter((e) => String(e[0]).includes("same key"))).toEqual([]);
  });
});
