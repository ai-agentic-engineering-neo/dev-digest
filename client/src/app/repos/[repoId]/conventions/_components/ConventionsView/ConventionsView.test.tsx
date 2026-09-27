import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScan, ConventionsPage } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/repos/r1/conventions",
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

const runScan = vi.fn();
const updateCandidate = vi.fn();
let page: ConventionsPage;

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: page, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunConventionScan: () => ({ mutateAsync: runScan, isPending: false }),
  useUpdateCandidate: () => ({ mutate: updateCandidate, isPending: false }),
  usePreviewConventionsSkill: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
  useCreateConventionsSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const candidate = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  rule: "Always use async/await instead of .then() chains.",
  category: "async",
  status: "pending",
  confidence: 0.91,
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_sha: "abc1234",
  scan_id: "s1",
  skill_id: null,
  created_at: "2026-09-22T10:00:00.000Z",
  updated_at: "2026-09-22T10:00:00.000Z",
  ...over,
});

const scan = (over: Partial<ConventionScan> = {}): ConventionScan => ({
  id: "s1",
  repo_id: "r1",
  status: "done",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc1234",
  sample_files: ["package.json", "src/api/users.ts"],
  candidates_total: 3,
  candidates_kept: 2,
  discarded: { missing_file: 1, bad_lines: 0, snippet_mismatch: 0, duplicate: 0, rejected_before: 0 },
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  error: null,
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  ...over,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills, common }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  runScan.mockReset();
  updateCandidate.mockReset();
  page = { scan: null, candidates: [] };
});

describe("ConventionsView", () => {
  it("offers Run scan and no Re-scan before the first scan", () => {
    renderView();
    expect(screen.getByRole("button", { name: /run scan/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-scan/i })).not.toBeInTheDocument();
  });

  it("offers Re-scan once a scan exists — a re-run is a different decision", () => {
    page = { scan: scan(), candidates: [candidate()] };
    renderView();
    expect(screen.getByRole("button", { name: /re-scan/i })).toBeInTheDocument();
  });

  it("says how many files were sampled and how many proposals were discarded", () => {
    page = { scan: scan(), candidates: [candidate()] };
    renderView();
    expect(screen.getByText(/Detected from 2 sample files/)).toBeInTheDocument();
    expect(screen.getByText(/1 discarded without evidence/)).toBeInTheDocument();
  });

  it("surfaces a failed scan with its reason instead of an empty list", () => {
    page = {
      scan: scan({ status: "failed", error: "repo_not_indexed: not indexed yet" }),
      candidates: [],
    };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(/not indexed yet/);
  });

  it("hides Create skill until something is accepted", () => {
    page = { scan: scan(), candidates: [candidate()] };
    renderView();
    expect(screen.queryByRole("button", { name: /create skill/i })).not.toBeInTheDocument();
  });

  it("shows Create skill once a candidate is accepted", () => {
    page = { scan: scan(), candidates: [candidate({ status: "accepted" })] };
    renderView();
    expect(screen.getByRole("button", { name: /create skill/i })).toBeInTheDocument();
  });

  it("hides rejected candidates behind a toggle rather than deleting them", () => {
    page = {
      scan: scan(),
      candidates: [candidate({ id: "c2", status: "rejected", rule: "Refused rule." })],
    };
    renderView();
    expect(screen.queryByText("Refused rule.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show rejected/i }));
    expect(screen.getByText("Refused rule.")).toBeInTheDocument();
  });

  it("keeps the toolbar when every candidate was rejected, instead of claiming nothing was found", () => {
    page = {
      scan: scan(),
      candidates: [candidate({ id: "c2", status: "rejected", rule: "Refused rule." })],
    };
    renderView();
    expect(screen.queryByText(/No conventions extracted yet/)).not.toBeInTheDocument();
    expect(screen.getByText(/Every candidate here was rejected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show rejected/i })).toBeInTheDocument();
  });

  it("starts a scan from the empty state", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /run scan/i }));
    expect(runScan).toHaveBeenCalled();
  });
});
