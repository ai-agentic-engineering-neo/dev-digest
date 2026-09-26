/**
 * DiffTab — Smart Order (L03): group ordering, boilerplate default-collapsed,
 * severity chips, the order toggle + URL wiring, loading/error fallbacks and
 * the large-PR banner. Hooks are mocked via `vi.mock` on the SAME specifiers
 * `DiffTab.tsx` imports (`@/lib/hooks/reviews`, `@/lib/hooks/smart-diff`) so
 * no QueryClient/network is involved; only `fireEvent` drives interaction.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({
  reviews: { data: [] as ReviewRecord[] | undefined, isPending: false },
  smart: {
    data: undefined as SmartDiff | undefined,
    isPending: false,
    isError: false,
  },
  useSmartDiffSpy: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => state.reviews,
  useFindingAction: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: (prId: string | null) => {
    state.useSmartDiffSpy(prId);
    return state.smart;
  },
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => {
  state.reviews = { data: [], isPending: false };
  state.smart = { data: undefined, isPending: false, isError: false };
  state.useSmartDiffSpy = vi.fn();
});

function dsFile(path: string, findingLines: number[] = []) {
  return { path, pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: findingLines };
}

const FILES: PrFile[] = [
  { path: "x.ts", additions: 1, deletions: 0, patch: null },
  { path: "y.ts", additions: 1, deletions: 0, patch: null },
  { path: "a.test.ts", additions: 1, deletions: 0, patch: null },
  { path: "tsconfig.json", additions: 1, deletions: 0, patch: null },
  { path: "README.md", additions: 1, deletions: 0, patch: null },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: null },
];

const FIVE_ROLE_SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [dsFile("x.ts"), dsFile("y.ts")] },
    { role: "tests", files: [dsFile("a.test.ts")] },
    { role: "wiring", files: [dsFile("tsconfig.json")] },
    { role: "docs", files: [dsFile("README.md")] },
    { role: "boilerplate", files: [dsFile("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

function findingFixture(o: Partial<FindingRecord> & { id: string; file: string; severity: FindingRecord["severity"] }): FindingRecord {
  return {
    category: "bug",
    title: `Finding ${o.id}`,
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

/** x.ts: CRITICAL + 2xWARNING (counts once in the WARNING chip); y.ts: WARNING. */
const CORE_CHIP_REVIEWS: ReviewRecord[] = [
  {
    id: "rv1",
    pr_id: "p1",
    agent_id: "agent-a",
    run_id: null,
    agent_name: "Agent A",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-09-01T00:00:00Z",
    findings: [
      findingFixture({ id: "f1", file: "x.ts", severity: "CRITICAL" }),
      findingFixture({ id: "f2", file: "x.ts", severity: "WARNING" }),
      findingFixture({ id: "f3", file: "x.ts", severity: "WARNING" }),
      findingFixture({ id: "f4", file: "y.ts", severity: "WARNING" }),
    ],
  },
];

function renderTab(props: Partial<Parameters<typeof DiffTab>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      <DiffTab
        prId="p1"
        filesCount={FILES.length}
        files={FILES}
        canComment
        orderParam={null}
        onOrderParamChange={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart order groups", () => {
  it("renders the 5 group headers in the fixed order Core, Tests, Wiring, Docs, Boilerplate", () => {
    state.smart = { data: FIVE_ROLE_SMART_DIFF, isPending: false, isError: false };
    const { container } = renderTab();
    const labels = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"];
    const positions = labels.map((l) => container.textContent!.indexOf(l));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("boilerplate starts collapsed (path hidden, count shown); clicking its header reveals the file", () => {
    state.smart = { data: FIVE_ROLE_SMART_DIFF, isPending: false, isError: false };
    renderTab();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    const boilerplateHeader = screen.getByRole("button", { name: /Boilerplate/i });
    expect(boilerplateHeader.textContent).toContain("1 files");

    fireEvent.click(boilerplateHeader);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("severity chips count FILES, not findings; no SUGGESTION chip; chips survive collapsing the group", () => {
    state.smart = {
      data: { ...FIVE_ROLE_SMART_DIFF, groups: [{ role: "core", files: [dsFile("x.ts"), dsFile("y.ts")] }] },
      isPending: false,
      isError: false,
    };
    state.reviews = { data: CORE_CHIP_REVIEWS, isPending: false };
    renderTab({ files: [FILES[0]!, FILES[1]!], filesCount: 2 });

    expect(screen.getByLabelText("1 files with CRITICAL findings")).toBeInTheDocument();
    expect(screen.getByLabelText("2 files with WARNING findings")).toBeInTheDocument();
    expect(screen.queryByLabelText(/files with SUGGESTION findings/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Core/i }));
    expect(screen.getByLabelText("1 files with CRITICAL findings")).toBeInTheDocument();
    expect(screen.getByLabelText("2 files with WARNING findings")).toBeInTheDocument();
  });
});

describe("DiffTab — order toggle + URL", () => {
  it("clicking Original order calls onOrderParamChange('original')", () => {
    state.smart = { data: FIVE_ROLE_SMART_DIFF, isPending: false, isError: false };
    const onChange = vi.fn();
    renderTab({ onOrderParamChange: onChange });

    fireEvent.click(screen.getByText("Original order"));
    expect(onChange).toHaveBeenCalledWith("original");
  });

  it('with orderParam="original" there are no group headers and files render in PrDetail.files order; clicking Smart order calls onOrderParamChange(null)', () => {
    const onChange = vi.fn();
    const { container } = renderTab({ orderParam: "original", onOrderParamChange: onChange });

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    const positions = FILES.map((f) => container.textContent!.indexOf(f.path));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    fireEvent.click(screen.getByText("Smart order"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('with orderParam="original", files render directly with no group headers or smart-order skeleton, even while the mocked smart-diff is pending', () => {
    state.smart = { data: undefined, isPending: true, isError: false };
    const { container } = renderTab({ orderParam: "original" });

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    const positions = FILES.map((f) => container.textContent!.indexOf(f.path));
    expect(positions.every((p) => p >= 0)).toBe(true);
  });
});

describe("DiffTab — loading + error fallbacks", () => {
  it("renders no file path while usePrReviews is pending", () => {
    state.reviews = { data: undefined, isPending: true };
    renderTab();
    expect(screen.queryByText("x.ts")).not.toBeInTheDocument();
  });

  it("a smart-diff error shows the unavailable message and falls back to the original file order", () => {
    state.smart = { data: undefined, isPending: false, isError: true };
    const { container } = renderTab();
    expect(
      screen.getByText("Smart order is unavailable — showing the original order."),
    ).toBeInTheDocument();
    const positions = FILES.map((f) => container.textContent!.indexOf(f.path));
    expect(positions.every((p) => p >= 0)).toBe(true);
  });
});

describe("DiffTab — large PR banner", () => {
  it('shows "This PR is large (450 changed lines)" when too_big is true', () => {
    state.smart = {
      data: { ...FIVE_ROLE_SMART_DIFF, split_suggestion: { too_big: true, total_lines: 450, proposed_splits: [] } },
      isPending: false,
      isError: false,
    };
    renderTab();
    expect(screen.getByText("This PR is large (450 changed lines)")).toBeInTheDocument();
  });

  it("shows no banner when too_big is false", () => {
    state.smart = { data: FIVE_ROLE_SMART_DIFF, isPending: false, isError: false };
    renderTab();
    expect(screen.queryByText(/This PR is large/)).not.toBeInTheDocument();
  });
});
