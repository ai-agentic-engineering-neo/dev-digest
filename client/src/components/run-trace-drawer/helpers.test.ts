import { describe, it, expect } from "vitest";
import type { RunTraceView } from "@/lib/types";
import { specsReadView } from "./helpers";

const base = { specs_read: [] as string[] } as unknown as RunTraceView;

describe("specsReadView (SPEC-04 AC-6)", () => {
  it("ok block → included then left-out in stored order, flagged when the PR changes them", () => {
    const trace = {
      ...base,
      specs_read: ["docs/b.md", "docs/a.md"],
      project_context: {
        status: "ok",
        cap_tokens: 4000,
        total_tokens: 30,
        included: [
          { path: "docs/b.md", tokens: 10 },
          { path: "docs/a.md", tokens: 20 },
        ],
        left_out: [
          { path: "specs/big.md", tokens: 5000, reason: "too_large" },
          { path: "docs/gone.md", tokens: null, reason: "missing" },
        ],
        changed_by_pr: ["docs/a.md", "docs/gone.md"],
      },
    } as RunTraceView;
    expect(specsReadView(trace)).toEqual({
      kind: "detail",
      included: [
        { path: "docs/b.md", changed: false },
        { path: "docs/a.md", changed: true },
      ],
      leftOut: [
        { path: "specs/big.md", reason: "too_large", changed: false },
        { path: "docs/gone.md", reason: "missing", changed: true },
      ],
      unavailable: [],
    });
  });

  it("ok block with repo_unavailable → those paths in detail.unavailable (SPEC-03 AC-11)", () => {
    const trace = {
      ...base,
      project_context: {
        status: "ok",
        cap_tokens: 4000,
        total_tokens: 5,
        included: [{ path: ".devdigest/specs/x.md", tokens: 5 }],
        left_out: [],
        changed_by_pr: [],
        repo_unavailable: ["docs/a.md"],
      },
    } as RunTraceView;
    const view = specsReadView(trace);
    expect(view).toMatchObject({ kind: "detail", unavailable: ["docs/a.md"] });
    expect(view.kind === "detail" && view.included[0]?.path).toBe(".devdigest/specs/x.md");
  });

  it("unavailable block → the attached paths", () => {
    const trace = {
      ...base,
      project_context: { status: "unavailable", reason: "repo_not_synced", attached: ["docs/a.md"] },
    } as RunTraceView;
    expect(specsReadView(trace)).toEqual({ kind: "unavailable", attached: ["docs/a.md"] });
  });

  it("no block but specs_read (run recorded before this spec) → the paths", () => {
    expect(specsReadView({ ...base, specs_read: ["docs/a.md"] })).toEqual({ kind: "paths", paths: ["docs/a.md"] });
  });

  it("neither → none", () => {
    expect(specsReadView(base)).toEqual({ kind: "none" });
    expect(specsReadView({ ...base, project_context: null })).toEqual({ kind: "none" });
  });
});
