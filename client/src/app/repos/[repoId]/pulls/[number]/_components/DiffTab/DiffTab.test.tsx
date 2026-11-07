import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, RunSummary } from "@devdigest/shared";
import type { SmartDiff, SmartDiffRole } from "@/lib/types";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";
import { useStickyOffset } from "./hooks/useStickyOffset";

const PATCH = "@@ -1,2 +1,3 @@\n first\n+second\n third";
const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "README.md", additions: 1, deletions: 0, patch: PATCH },
];

function smartOf(over: Partial<Record<SmartDiffRole, string[]>> = {}, tooBig = false, total = 3): SmartDiff {
  const by: Record<SmartDiffRole, string[]> = {
    core: ["src/a.ts", "src/b.ts"],
    tests: [],
    wiring: [],
    docs: [],
    boilerplate: [],
    ...over,
  };
  const roles: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];
  return {
    groups: roles.map((role) => ({
      role,
      files: by[role].map((path) => ({
        path,
        additions: 1,
        deletions: 0,
        pseudocode_summary: null,
        finding_lines: [],
      })),
    })),
    split_suggestion: { too_big: tooBig, total_lines: total, proposed_splits: [] },
  } as SmartDiff;
}

function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "bug",
    title: `title ${id}`,
    file: "src/a.ts",
    start_line: 2,
    end_line: 2,
    rationale: `rationale ${id}`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(
  id: string,
  agent: string | null,
  findings: FindingRecord[],
  over: Partial<ReviewRecord> = {},
): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agent,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-02T00:00:00Z",
    findings,
    ...over,
  } as ReviewRecord;
}

const COMMENT = {
  id: 1,
  path: "src/b.ts",
  line: 1,
  original_line: 1,
  side: "RIGHT",
  body: "human remark",
  user: "bob",
  created_at: "2026-01-01T00:00:00Z",
  html_url: "https://example.test/c/1",
  in_reply_to_id: null,
  is_outdated: false,
} as PrReviewComment;

function run(id: string, tin: number, tout: number): RunSummary {
  return { run_id: id, tokens_in: tin, tokens_out: tout, status: "done" } as RunSummary;
}

const mutate = vi.fn();
const refetch = vi.fn();
let smartState: { data?: SmartDiff; isLoading: boolean; isError: boolean };
/** undefined = the reviews query is still loading. */
let reviewsData: ReviewRecord[] | undefined;
let runsData: RunSummary[] | undefined;
let commentsData: PrReviewComment[];

vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => ({ ...smartState, refetch }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviewsData, isSuccess: reviewsData !== undefined }),
  usePrRuns: () => ({ data: runsData }),
  usePrComments: () => ({ data: commentsData }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFindingAction: () => ({ isPending: false, mutate }),
}));

function reset() {
  smartState = { data: smartOf(), isLoading: false, isError: false };
  reviewsData = [];
  runsData = [];
  commentsData = [];
  mutate.mockClear();
  refetch.mockClear();
}
reset();
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  reset();
});

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr1" filesCount={3} files={FILES} canComment />
    </NextIntlClientProvider>
  );
}
const renderTab = () => render(ui());

describe("DiffTab", () => {
  it("renders five role groups in order with counts, header order and collapse-all", () => {
    reviewsData = [
      review("r1", "A", [finding("f1"), finding("f2", { start_line: 3 }), finding("f3", { start_line: 1 })]),
    ];
    renderTab();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Core", "Tests", "Wiring", "Docs", "Boilerplate"]);
    expect(screen.getAllByText("0 files")).toHaveLength(4);
    // C5: one file with 3 findings + one clean file -> "● 1"
    expect(screen.getAllByText("● 1")).toHaveLength(1);
    const header = screen.getByRole("heading", { level: 3, name: "Core" }).parentElement!;
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const desc = within(header).getByText("The substance of the change — review closely");
    const dot = within(header).getByText("● 1");
    const count = within(header).getByText("3 files");
    const toggle = within(header).getByRole("button", { name: "Collapse all" });
    expect(follows(desc, dot) && follows(dot, count) && follows(count, toggle)).toBe(true);
    expect(screen.getAllByText("second").length).toBeGreaterThan(0);
    fireEvent.click(toggle);
    expect(within(header).getByRole("button", { name: "Expand all" })).toBeInTheDocument();
    expect(screen.queryAllByText("second")).toHaveLength(0);
  });

  it("sticks group headers below the PR header, offset by its measured height", () => {
    const prHeader = document.createElement("div");
    prHeader.setAttribute("data-pr-detail-header", "");
    prHeader.getBoundingClientRect = () => ({ height: 72 }) as DOMRect;
    document.body.appendChild(prHeader);
    renderTab();
    const core = screen.getByRole("heading", { level: 3, name: "Core" }).parentElement!;
    expect(core).toHaveStyle({ position: "sticky", top: "72px" });
  });

  it("starts docs files collapsed", () => {
    smartState = { data: smartOf({ core: [], docs: ["README.md", "src/a.ts", "src/b.ts"] }), isLoading: false, isError: false };
    renderTab();
    // The files are listed in the Docs group (not an empty/error render)…
    // h3 → GroupHeader → SmartDiffGroup root (header + its file list)
    const docs = screen.getByRole("heading", { level: 3, name: "Docs" }).parentElement!.parentElement!;
    expect(within(docs).getByText("3 files")).toBeInTheDocument();
    for (const path of ["README.md", "src/a.ts", "src/b.ts"]) {
      expect(within(docs).getByRole("button", { name: (name) => name.startsWith(path) })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    // …and their lines are hidden.
    expect(screen.queryAllByText("second")).toHaveLength(0);
  });

  it("switches between smart and original order from one toolbar", () => {
    reviewsData = [review("r1", "A", [finding("f1")])];
    renderTab();
    const group = screen.getByRole("group", { name: "Diff view" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Smart order",
      "Original order",
      "Hide findings (1)",
    ]);
    fireEvent.click(within(group).getByRole("button", { name: "Original order" }));
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    const paths = FILES.map((f) => screen.getByText(f.path));
    expect(paths[0]!.compareDocumentPosition(paths[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Smart order" }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  });

  it("shows the finding under its line, dismisses it and mutes the card", () => {
    reviewsData = [review("r1", "A", [finding("f1")])];
    const { rerender } = renderTab();
    expect(screen.getByText("title f1")).toBeInTheDocument();
    expect(screen.getByText("rationale f1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "blocker" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });

    reviewsData = [review("r1", "A", [finding("f1", { dismissed_at: "2026-01-03T00:00:00Z" })])];
    rerender(ui());
    expect(screen.queryByText(/^● /)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "blocker" })).not.toBeInTheDocument();
    expect(screen.getByText("title f1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("title f1"));
    expect(screen.queryByText("rationale f1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("title f1"));
    expect(screen.getByText("rationale f1")).toBeInTheDocument();
  });

  it("counts only non-dismissed findings in the toggle and hides cards and threads", () => {
    const a = [1, 2, 3, 4, 5].map((i) => finding(`a${i}`, { start_line: 2 }));
    const b = [1, 2, 3].map((i) => finding(`b${i}`, { start_line: 3 }));
    const dismissed = finding("d1", { start_line: 1, dismissed_at: "2026-01-03T00:00:00Z" });
    reviewsData = [review("r1", "A", [...a, dismissed]), review("r2", "B", b)];
    commentsData = [COMMENT];
    renderTab();
    expect(screen.getByText("title a1")).toBeInTheDocument();
    expect(screen.getByText("human remark")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide findings (8)" }));
    expect(screen.getByRole("button", { name: "Show findings (8)" })).toBeInTheDocument();
    expect(screen.queryByText("title a1")).not.toBeInTheDocument();
    expect(screen.queryByText("human remark")).not.toBeInTheDocument();
  });

  it("disables the toggle with no findings and says the review has not run", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Hide findings (0)" })).toBeDisabled();
    expect(screen.getByText("Review not run yet — findings will appear here")).toBeInTheDocument();
    expect(screen.queryByText(/new tokens/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^● /)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  });

  it("does not say the review has not run while reviews are still loading", () => {
    reviewsData = undefined;
    const { rerender } = renderTab();
    expect(screen.queryByText(/Review not run yet/)).not.toBeInTheDocument();
    reviewsData = [];
    rerender(ui());
    expect(screen.getByText("Review not run yet — findings will appear here")).toBeInTheDocument();
  });

  it("sums only the latest review's runs in the tokens note", () => {
    reviewsData = [
      review("r1", "A", [], { run_id: "run-a", created_at: "2026-01-03T00:00:00Z" }),
      review("r0", "A", [], { run_id: "run-old", created_at: "2026-01-01T00:00:00Z" }),
      review("r2", "B", [], { run_id: "run-b" }),
    ];
    runsData = [run("run-a", 1000, 200), run("run-b", 700, 100), run("run-old", 9000, 0)];
    renderTab();
    expect(screen.getByText("0 new tokens · built on 2,000 from last review")).toBeInTheDocument();
    expect(screen.queryByText(/Review not run yet/)).not.toBeInTheDocument();
  });

  it("updates counters, cards and the tokens note when new data arrives", () => {
    reviewsData = [review("r1", "A", [], { run_id: "run-a" })];
    runsData = [run("run-a", 100, 0)];
    const { rerender } = renderTab();
    expect(screen.getByText(/built on 100 from last review/)).toBeInTheDocument();
    expect(screen.queryByText("title f1")).not.toBeInTheDocument();
    reviewsData = [review("r3", "A", [finding("f1")], { run_id: "run-c", created_at: "2026-01-05T00:00:00Z" })];
    runsData = [run("run-c", 400, 100)];
    rerender(ui());
    expect(screen.getByText(/built on 500 from last review/)).toBeInTheDocument();
    expect(screen.getByText("title f1")).toBeInTheDocument();
    expect(screen.getByText("● 1")).toBeInTheDocument();
  });

  it("shows the large-PR banner only when too_big", () => {
    smartState = { data: smartOf({}, true, 1200), isLoading: false, isError: false };
    const { rerender } = renderTab();
    expect(screen.getByText("This PR is large (1200 changed lines)")).toBeInTheDocument();
    smartState = { data: smartOf({}, false, 1200), isLoading: false, isError: false };
    rerender(ui());
    expect(screen.queryByText(/This PR is large/)).not.toBeInTheDocument();
  });

  it("offers a retry when the smart diff fails to load", () => {
    smartState = { isLoading: false, isError: true };
    renderTab();
    expect(screen.getByText("Couldn't load the smart diff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("useStickyOffset", () => {
  it("returns the PrDetailHeader height, and 0 without the element", () => {
    const { result: none } = renderHook(() => useStickyOffset());
    expect(none.current).toBe(0);

    const el = document.createElement("div");
    el.setAttribute("data-pr-detail-header", "");
    el.getBoundingClientRect = () => ({ height: 64 }) as DOMRect;
    document.body.appendChild(el);
    const { result } = renderHook(() => useStickyOffset());
    expect(result.current).toBe(64);
  });
});
