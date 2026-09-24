import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DiffViewer } from "./DiffViewer";
import type { DiffFindingApi, DiffFindingItem } from "../findings";
import type { PrFile } from "@/lib/types";

const PATCH = `@@ -1,3 +1,3 @@
 context
-removed line
+added line`;
const FILE: PrFile = { path: "a.ts", additions: 1, deletions: 1, patch: PATCH };

// No line follows the deletion, so the new file has no line 2 at all — a
// finding anchored there can never match a rendered (RIGHT) line.
const DELETE_ONLY_PATCH = `@@ -1,2 +1,1 @@
 context
-removed line`;
const DELETE_ONLY_FILE: PrFile = { path: "a.ts", additions: 0, deletions: 1, patch: DELETE_ONLY_PATCH };

function findingApi(items: DiffFindingItem[], show = true): DiffFindingApi {
  return {
    items,
    flagged: new Set(items.map((i) => i.file)),
    show,
    renderCard: (item) => <div data-testid={`card-${item.id}`}>{item.id}</div>,
  };
}

describe("DiffViewer findings slot", () => {
  it("renders the card under its line and the severity label", () => {
    renderWithProviders(
      <DiffViewer
        files={[FILE]}
        findingApi={findingApi([{ id: "f1", file: "a.ts", start_line: 2, severity: "CRITICAL" }])}
      />,
    );
    expect(screen.getByTestId("card-f1")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("puts a finding anchored to a deleted (old-side) line into the unmatched block", () => {
    renderWithProviders(
      <DiffViewer
        files={[DELETE_ONLY_FILE]}
        findingApi={findingApi([{ id: "f2", file: "a.ts", start_line: 2, severity: "WARNING" }])}
      />,
    );
    // Line 2 was deleted and nothing replaces it — no RIGHT:2 to anchor on.
    expect(screen.getByText("Findings not shown inline")).toBeInTheDocument();
    expect(screen.getByTestId("card-f2")).toBeInTheDocument();
  });

  it("keeps the severity label visible even when show=false hides the card", () => {
    renderWithProviders(
      <DiffViewer
        files={[FILE]}
        findingApi={findingApi([{ id: "f3", file: "a.ts", start_line: 2, severity: "SUGGESTION" }], false)}
      />,
    );
    expect(screen.getByText("suggestion")).toBeInTheDocument();
    expect(screen.queryByTestId("card-f3")).not.toBeInTheDocument();
  });

  it("shows a dot on a flagged file's header", () => {
    renderWithProviders(
      <DiffViewer
        files={[FILE]}
        findingApi={findingApi([{ id: "f4", file: "a.ts", start_line: 2, severity: "CRITICAL" }])}
      />,
    );
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
  });
});
