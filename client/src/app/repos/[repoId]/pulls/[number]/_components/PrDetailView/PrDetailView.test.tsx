import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * specs/11-why-risk-brief.md Q7/AC-39 — `PrDetailView.handleFocusFile`
 * (the line-for-line analogue of `handleSelectFinding`, per
 * `client/LEARNINGS.md:86-132`'s target+nonce context) switches the active
 * tab to Files/Diff and sets `focusTarget`, which then reaches `DiffTab`.
 *
 * `PrDetailView` has no prior test file and stands up a large fixture
 * surface (pulls/reviews/runs hooks, routing, five child components) — per
 * the test-writer brief, every child component and every data hook is
 * mocked here; this test asserts ONLY the tab-switch + focusTarget
 * propagation, not full integration.
 */

let currentSearch = new URLSearchParams();
const replace = vi.fn((url: string) => {
  const qIndex = url.indexOf("?");
  currentSearch = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : "");
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "42" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => currentSearch,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/demo" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

const PR = {
  id: "pr-1",
  number: 42,
  title: "Fix rate limiting",
  author: "marisa.koch",
  branch: "feat/x",
  base: "main",
  head_sha: "sha-head",
  additions: 10,
  deletions: 2,
  files_count: 1,
  status: "open",
  body: "Fixes it.",
  files: [{ path: "src/a.ts", additions: 10, deletions: 2, patch: null }],
  commits: [],
  linked_issue: null,
};

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-1", number: 42 }], isLoading: false }),
  usePullDetail: () => ({ data: PR, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));

vi.mock("../PrDetailHeader", () => ({
  PrDetailHeader: () => <div>header</div>,
}));

vi.mock("../OverviewTab", () => ({
  OverviewTab: (props: { onFocusFile?: (file: string, line: number | null) => void }) => (
    <button onClick={() => props.onFocusFile?.("src/a.ts", 7)}>trigger-focus</button>
  ),
}));

vi.mock("../FindingsTab", () => ({
  FindingsTab: () => <div>findings-tab</div>,
}));

const diffTabSpy = vi.fn();
vi.mock("../DiffTab", () => ({
  DiffTab: (props: unknown) => {
    diffTabSpy(props);
    return <div>diff-tab</div>;
  },
}));

vi.mock("@/components/run-trace-drawer/RunTraceDrawer", () => ({
  default: () => null,
}));

import { PrDetailView } from "./PrDetailView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentSearch = new URLSearchParams();
});

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <PrDetailView />
    </QueryClientProvider>,
  );
}

describe("PrDetailView", () => {
  it("Q7/AC-39: activating a brief review-focus target switches to the Diff tab and threads focusTarget to DiffTab", () => {
    renderView();

    // Starts on Overview (default tab); DiffTab is not mounted yet.
    expect(screen.getByText("trigger-focus")).toBeInTheDocument();
    expect(screen.queryByText("diff-tab")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("trigger-focus"));

    expect(currentSearch.get("tab")).toBe("diff");
    expect(screen.getByText("diff-tab")).toBeInTheDocument();
    expect(diffTabSpy).toHaveBeenCalled();
    const lastCall = diffTabSpy.mock.calls.at(-1)![0] as {
      focusTarget: { file: string; line: number | null; n: number } | null;
    };
    expect(lastCall.focusTarget).toEqual({ file: "src/a.ts", line: 7, n: 1 });
  });
});
