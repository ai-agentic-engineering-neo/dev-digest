import { describe, it, expect } from "vitest";
import type { AttachedDocument, ProjectDocument } from "@devdigest/shared";
import {
  attachedPathsInOrder,
  attachedPosition,
  attachedTokenTotal,
  buildRows,
  matchesFilter,
  moveBy,
  moveOnto,
} from "./helpers";

function doc(path: string, overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return { path, doc_type: "specs", tokens: 10, used_by: 0, ...overrides };
}

function attached(path: string, overrides: Partial<AttachedDocument> = {}): AttachedDocument {
  return { repo_id: "repo-1", path, order: 0, attached: true, tokens: 10, status: "present", ...overrides };
}

describe("buildRows", () => {
  it("orders attached rows by their persisted `order`, then never-attached catalog rows behind them", () => {
    const catalog = [doc("specs/z.md"), doc("specs/a.md")];
    const attachments = [attached("specs/z.md", { order: 1 }), attached("specs/a.md", { order: 0 })];

    const rows = buildRows(catalog, attachments);
    expect(rows.map((r) => r.path)).toEqual(["specs/a.md", "specs/z.md"]);
  });

  it("AC-26 — an attachment whose file no longer resolves still renders, marked missing, with docType null", () => {
    const rows = buildRows([], [attached("specs/gone.md", { status: "missing", tokens: 0 })]);
    expect(rows).toEqual([
      { path: "specs/gone.md", docType: null, tokens: 0, attached: true, missing: true },
    ]);
  });

  it("an attached-but-toggled-off row keeps its docType from the catalog and reports attached: false", () => {
    const rows = buildRows([doc("specs/a.md")], [attached("specs/a.md", { attached: false })]);
    expect(rows[0]).toMatchObject({ path: "specs/a.md", docType: "specs", attached: false });
  });

  it("respects pendingOrder over the persisted attachment order while a drag is in flight", () => {
    const catalog = [doc("specs/a.md"), doc("specs/b.md")];
    const attachments = [attached("specs/a.md", { order: 0 }), attached("specs/b.md", { order: 1 })];

    const rows = buildRows(catalog, attachments, ["specs/b.md", "specs/a.md"]);
    expect(rows.map((r) => r.path)).toEqual(["specs/b.md", "specs/a.md"]);
  });

  it("a never-attached catalog document uses the catalog's token count, not an attachment's", () => {
    const rows = buildRows([doc("specs/new.md", { tokens: 42 })], []);
    expect(rows[0]).toMatchObject({ path: "specs/new.md", tokens: 42, attached: false, missing: false });
  });
});

describe("moveOnto / moveBy", () => {
  const rows = buildRows(
    [],
    [attached("a.md", { order: 0 }), attached("b.md", { order: 1 }), attached("c.md", { order: 2 })],
  );

  it("moveOnto drops the dragged path into the target's slot", () => {
    expect(moveOnto(rows, "a.md", "c.md")).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("moveBy nudges a path by delta slots", () => {
    expect(moveBy(rows, "a.md", 1)).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("moveBy is a no-op when delta pushes past either edge", () => {
    expect(moveBy(rows, "a.md", -1)).toEqual(["a.md", "b.md", "c.md"]);
    expect(moveBy(rows, "c.md", 1)).toEqual(["a.md", "b.md", "c.md"]);
  });
});

describe("attachedPathsInOrder", () => {
  it("drops any never-attached path from the reorder payload, even if present in the order array", () => {
    const rows = buildRows([doc("specs/off.md")], [attached("specs/on.md")]);
    expect(attachedPathsInOrder(rows, ["specs/off.md", "specs/on.md"])).toEqual(["specs/on.md"]);
  });
});

describe("matchesFilter", () => {
  it("is case-insensitive and matches on any substring", () => {
    expect(matchesFilter("specs/README.md", "readme")).toBe(true);
    expect(matchesFilter("specs/README.md", "docs")).toBe(false);
  });

  it("an empty/whitespace-only query matches everything", () => {
    expect(matchesFilter("specs/a.md", "")).toBe(true);
    expect(matchesFilter("specs/a.md", "   ")).toBe(true);
  });
});

describe("attachedTokenTotal", () => {
  it("sums only attached rows, ignoring never-attached catalog rows", () => {
    const rows = buildRows(
      [doc("specs/off.md", { tokens: 100 })],
      [attached("specs/on.md", { tokens: 5 }), attached("specs/on2.md", { tokens: 7 })],
    );
    expect(attachedTokenTotal(rows)).toBe(12);
  });
});

describe("attachedPosition", () => {
  it("is 1-based and counted over attached rows only", () => {
    const rows = buildRows(
      [doc("specs/off.md")],
      [attached("specs/a.md", { order: 0 }), attached("specs/b.md", { order: 1 })],
    );
    expect(attachedPosition(rows, "specs/b.md")).toEqual({ index: 2, total: 2 });
    expect(attachedPosition(rows, "specs/off.md")).toEqual({ index: 0, total: 2 });
  });
});
