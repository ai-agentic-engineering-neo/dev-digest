import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
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

/* Fake DevDigest API behind `api.*` — the real hooks run on top of it. */
let stored: StoredBrief | null;
let resolvePost: (r: PrBriefResponse) => void;
const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (p: string) => apiGet(p), post: (p: string) => apiPost(p) } };
});

beforeEach(() => {
  stored = null;
  apiGet.mockImplementation(async (path: string) => {
    if (path === `/pulls/${PR_ID}/brief`) return response(stored);
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
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ brief: briefMessages, blast: blastMessages }}>
        <OverviewTab prId={PR_ID} prBody="Body" repoFullName="acme/app" repoId="repo-1" onOpenFile={onOpenFile} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenFile;
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
    expect(follows(screen.getByText("Intent not yet analysed"), risks)).toBe(true);

    const focus = screen.getByRole("heading", { name: /Review focus/ }).closest("section")!;
    expect(follows(risks, focus)).toBe(true);
    fireEvent.click(within(focus).getByRole("button", { name: "Open src/auth/service.ts:40 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth/service.ts");
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
});
