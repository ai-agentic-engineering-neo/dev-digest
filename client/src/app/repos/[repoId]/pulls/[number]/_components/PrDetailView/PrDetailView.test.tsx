import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { parseTraceRunId } from "./helpers";

const RUN_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

const { state, refetchPulls, refetchDetail, replace } = vi.hoisted(() => ({
  state: {
    search: new URLSearchParams(),
    pulls: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
    detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  },
  refetchPulls: vi.fn(),
  refetchDetail: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "482" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => state.search,
}));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({ ...state.pulls, refetch: refetchPulls }),
  usePullDetail: () => ({ ...state.detail, refetch: refetchDetail }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
  useInvalidatePrRuns: () => ({ invalidateActiveRuns: vi.fn(), invalidateRunHistory: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Child views are covered by their own tests; stub them to keep this one about the view's states.
vi.mock("../PrDetailHeader", () => ({ PrDetailHeader: () => <div>header</div> }));
vi.mock("../OverviewTab", () => ({ OverviewTab: () => <div>overview</div> }));
vi.mock("../FindingsTab", () => ({ FindingsTab: () => <div>findings</div> }));
vi.mock("../DiffTab", () => ({ DiffTab: () => <div>diff</div> }));
vi.mock("../RunTraceDrawer", () => ({
  default: ({ runId }: { runId: string }) => <div data-testid="drawer">{runId}</div>,
}));

import { PrDetailView } from "./PrDetailView";

const PR = { id: "pr-uuid", number: 482, title: "Add payments", body: "", status: "needs_review", head_sha: "abc" };

afterEach(() => {
  cleanup();
  refetchPulls.mockReset();
  refetchDetail.mockReset();
  state.search = new URLSearchParams();
  state.pulls = { data: undefined, isLoading: false, isError: false, error: null };
  state.detail = { data: undefined, isLoading: false, isError: false, error: null };
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PrDetailView />
    </NextIntlClientProvider>,
  );
}

describe("parseTraceRunId", () => {
  it("accepts a run uuid and rejects anything else", () => {
    expect(parseTraceRunId(RUN_ID)).toBe(RUN_ID);
    expect(parseTraceRunId(null)).toBeNull();
    expect(parseTraceRunId("../repos/x/refresh?")).toBeNull();
    expect(parseTraceRunId(`${RUN_ID}/../x`)).toBeNull();
  });
});

describe("PrDetailView states", () => {
  it("shows not-found (no retry) when the PR number isn't in the loaded list", () => {
    state.pulls = { data: [{ ...PR, number: 1 }], isLoading: false, isError: false, error: null };
    renderView();
    expect(screen.getByText("Pull request not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to pull requests" })).toHaveAttribute("href", "/repos/r1/pulls");
    expect(refetchDetail).not.toHaveBeenCalled();
  });

  it("retries the PR list (not the detail) when the list fails", () => {
    state.pulls = { data: undefined, isLoading: false, isError: true, error: new Error("down") };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchPulls).toHaveBeenCalledTimes(1);
    expect(refetchDetail).not.toHaveBeenCalled();
  });

  it("opens the trace drawer for a valid ?trace and ignores a non-uuid one", () => {
    state.pulls = { data: [PR], isLoading: false, isError: false, error: null };
    state.detail = { data: PR, isLoading: false, isError: false, error: null };
    state.search = new URLSearchParams(`trace=${RUN_ID}`);
    renderView();
    expect(screen.getByTestId("drawer")).toHaveTextContent(RUN_ID);

    cleanup();
    state.search = new URLSearchParams("trace=../repos/x/refresh?");
    renderView();
    expect(screen.queryByTestId("drawer")).toBeNull();
  });
});
