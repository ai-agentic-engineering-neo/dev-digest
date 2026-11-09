import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import type { PrBlastRadius, PrBriefResponse, StoredBrief } from "@/lib/types";
import { OverviewTab } from "./OverviewTab";

const PR_ID = "11111111-1111-4111-8111-111111111111";

const BLAST: PrBlastRadius = {
  pr_id: PR_ID,
  head_sha: "head999",
  indexed_sha: "idx111",
  link_sha: "idx111",
  changed_symbols: [],
  downstream: [],
  unattributed_endpoints: [],
  summary: "",
  counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  callers_omitted: 0,
  degraded: false,
  reason: null,
};

const STORED: StoredBrief = {
  summary: "Adds token refresh to the auth service.",
  risks: [
    {
      kind: "auth",
      title: "Session expiry handling changed",
      explanation: "The refresh path extends sessions silently.",
      severity: "high",
      file_refs: ["src/auth/service.ts:38-50"],
      refs: [{ ref: "src/auth/service.ts:38-50", path: "src/auth/service.ts", start_line: 38, end_line: 50, in_diff: true }],
    },
  ],
  review_focus: [{ file: "src/auth/service.ts", line: 40, file_level: false, in_diff: true, reason: "Refresh logic starts here." }],
  missing_inputs: [],
  truncated: { spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 },
  head_sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  blast_link_sha: null,
  usage: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", tokens_in: 100, tokens_out: 50, cost_usd: null },
  generated_at: "2026-11-09T10:00:00.000Z",
};

const response = (brief: StoredBrief | null): PrBriefResponse => ({
  pr_id: PR_ID,
  model: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
  changed_files: 3,
  generating: false,
  outdated: false,
  brief,
});

const finding = (id: string, severity: "CRITICAL" | "WARNING") => ({ id, severity, dismissed_at: null }) as ReviewRecord["findings"][number];

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: PR_ID,
  agent_id: null,
  run_id: "run-1",
  agent_name: "Security",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 61,
  model: null,
  created_at: "2026-11-09T10:00:00.000Z",
  findings: [finding("f1", "CRITICAL"), finding("f2", "WARNING")],
};

const RUN = { run_id: "run-1", status: "done" } as RunSummary;

/* Fake DevDigest API behind `api.*` — the real hooks run on top of it. */
let stored: StoredBrief | null;
let reviews: ReviewRecord[];
let runs: RunSummary[];
let resolvePost: (r: PrBriefResponse) => void;
const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (p: string) => apiGet(p), post: (p: string) => apiPost(p) } };
});

beforeEach(() => {
  stored = null;
  reviews = [];
  runs = [];
  apiGet.mockImplementation(async (path: string) => {
    if (path === `/pulls/${PR_ID}/brief`) return response(stored);
    if (path === `/pulls/${PR_ID}/reviews`) return reviews;
    if (path === `/pulls/${PR_ID}/runs`) return runs;
    if (path === `/pulls/${PR_ID}/intent`) return null;
    if (path === `/pulls/${PR_ID}/blast`) return BLAST;
    if (path === `/pulls/${PR_ID}/prior-pulls`) return { pr_id: PR_ID, total: 0, pulls: [] };
    if (path === "/repos/repo-1/index-state") {
      return { status: "ready", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "idx111", updatedAt: "2026-11-09T10:00:00.000Z" };
    }
    throw new Error(`unexpected GET ${path}`);
  });
  apiPost.mockImplementation((path: string) => {
    if (path !== `/pulls/${PR_ID}/brief`) throw new Error(`unexpected POST ${path}`);
    return new Promise<PrBriefResponse>((resolve) => {
      resolvePost = (r) => {
        stored = r.brief;
        resolve(r);
      };
    });
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab() {
  const onOpenFile = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWith(qc, onOpenFile);
  return onOpenFile;
}

function renderWith(qc: QueryClient, onOpenFile: () => void) {
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ prReview: prReviewMessages, brief: briefMessages, blast: blastMessages }}>
        <OverviewTab prId={PR_ID} prBody="Body" repoFullName="acme/app" repoId="repo-1" onOpenFile={onOpenFile} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("OverviewTab", () => {
  it("opens without a model call, generates once, then shows risks under Intent and the focus list", async () => {
    const onOpenFile = renderTab();

    expect(await screen.findByText("No brief yet.")).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();

    const generate = screen.getByRole("button", { name: "Generate brief" });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();

    resolvePost(response(STORED));
    expect(await screen.findByText(STORED.summary)).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);

    const risks = await screen.findByRole("heading", { name: "Risk areas" });
    expect(follows(screen.getByText("Intent"), risks)).toBe(true);
    const leftColumn = screen.getByText("Intent").closest("section")!;
    expect(leftColumn).toContainElement(risks);
    expect(within(screen.getByText("Blast radius").closest("section")!).queryByRole("heading", { name: "Risk areas" })).toBeNull();
    expect(follows(screen.getByText("Intent not yet analysed"), risks)).toBe(true);

    const focus = screen.getByRole("heading", { name: /Review focus/ }).closest("section")!;
    expect(follows(risks, focus)).toBe(true);
    fireEvent.click(within(focus).getByRole("button", { name: "Open src/auth/service.ts:40 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth/service.ts", { start: 40, end: 40 });
  });

  it("with no brief, still renders the Intent and Blast radius content next to the empty state", async () => {
    const blast: PrBlastRadius = { ...BLAST, summary: "Touches the auth refresh path only." };
    const base = apiGet.getMockImplementation()!;
    apiGet.mockImplementation(async (path: string) => (path === `/pulls/${PR_ID}/blast` ? blast : base(path)));
    renderTab();

    expect(await screen.findByText("No brief yet.")).toBeInTheDocument();
    expect(await screen.findByText("Intent not yet analysed")).toBeInTheDocument();
    expect(await screen.findByText(blast.summary)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("disables the action and shows the generating status when the server reports generating", async () => {
    const base = apiGet.getMockImplementation()!;
    apiGet.mockImplementation(async (path: string) =>
      path === `/pulls/${PR_ID}/brief` ? { ...response(null), generating: true } : base(path),
    );
    renderTab();

    expect(await screen.findByText("Generating brief…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("shows a stored brief at once, with no POST", async () => {
    stored = STORED;
    renderTab();
    expect(await screen.findByText(STORED.summary)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("shows the newest finished review as the verdict and follows cache invalidation without a model call", async () => {
    stored = STORED;
    reviews = [REVIEW];
    runs = [RUN];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWith(qc, vi.fn());

    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("2 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText(STORED.summary)).toBeInTheDocument();

    reviews = [{ ...REVIEW, id: "rev-2", run_id: "run-2", verdict: "approve", created_at: "2026-11-09T11:00:00.000Z" }, REVIEW];
    runs = [{ run_id: "run-2", status: "done" } as RunSummary, RUN];
    await qc.invalidateQueries({ queryKey: ["reviews", PR_ID] });
    await qc.invalidateQueries({ queryKey: ["pr-runs", PR_ID] });
    expect(await screen.findByText("Approve")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();

    // Newest review deleted -> the previous verdict comes back, without remounting.
    reviews = [REVIEW];
    runs = [RUN];
    await qc.invalidateQueries({ queryKey: ["reviews", PR_ID] });
    await qc.invalidateQueries({ queryKey: ["pr-runs", PR_ID] });
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();

    // All reviews deleted -> the review-less look, brief still shown.
    reviews = [];
    runs = [];
    await qc.invalidateQueries({ queryKey: ["reviews", PR_ID] });
    await qc.invalidateQueries({ queryKey: ["pr-runs", PR_ID] });
    await waitFor(() => expect(screen.queryByText("Request changes")).not.toBeInTheDocument());
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PR SCORE/i)).not.toBeInTheDocument();
    expect(screen.getByText(STORED.summary)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("shows an unavailable note with Retry when the reviews fail to load, keeping the brief", async () => {
    stored = STORED;
    const base = apiGet.getMockImplementation()!;
    let reviewCalls = 0;
    apiGet.mockImplementation(async (path: string) => {
      if (path === `/pulls/${PR_ID}/reviews`) {
        reviewCalls += 1;
        throw new Error("boom");
      }
      return base(path);
    });
    renderTab();

    expect(await screen.findByText("Review verdict unavailable")).toBeInTheDocument();
    expect(screen.getByText(STORED.summary)).toBeInTheDocument();
    const before = reviewCalls;
    fireEvent.click(screen.getByRole("button", { name: "Retry loading the review verdict" }));
    await waitFor(() => expect(reviewCalls).toBeGreaterThan(before));
  });
});
