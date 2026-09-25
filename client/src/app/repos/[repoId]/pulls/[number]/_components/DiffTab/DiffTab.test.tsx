/* DiffTab — Smart Diff (server/specs/06-smart-diff.md): role groups, the
   group/file finding indicators, inline finding cards wired to Accept/Dismiss,
   the comments/findings toggle and the Smart/Original order switch. Real
   TanStack hooks against a stubbed fetch (client/INSIGHTS.md). */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within } from "@/test/render";
import { mockFetch, type RouteHandler } from "@/test/fetch-mock";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { DiffTab } from "./DiffTab";
import type { DiffOrder } from "./constants";

afterEach(cleanup);

const FILES: PrFile[] = [
  {
    path: "src/config.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,2 +1,3 @@\n context\n+added line",
  },
  { path: "README.md", additions: 1, deletions: 0, patch: null },
  { path: "pnpm-lock.yaml", additions: 40, deletions: 0, patch: null },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    { role: "core", files: [{ path: "src/config.ts", additions: 1, deletions: 0, finding_lines: [2] }] },
    { role: "tests", files: [] },
    { role: "wiring", files: [] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 40, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 42, proposed_splits: [] },
};

/** A small core file with no comment or finding (Smart order starts it collapsed). */
const UTIL: PrFile = { path: "src/util.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+util line" };

const SMART_DIFF_WITH_UTIL: SmartDiffResponse = {
  ...SMART_DIFF,
  groups: SMART_DIFF.groups.map((g) =>
    g.role === "core" ? { ...g, files: [...g.files, { path: UTIL.path, additions: 1, deletions: 0, finding_lines: [] }] } : g,
  ),
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 2,
  end_line: 2,
  rationale: "why",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv1",
  accepted_at: null,
  dismissed_at: null,
};

const REVIEW: ReviewRecord = {
  id: "rv1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run-1",
  agent_name: "Security",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 40,
  model: "gpt-4.1",
  created_at: "2026-06-01T00:00:00Z",
  findings: [FINDING],
};

function routes(over: Record<string, RouteHandler> = {}) {
  return mockFetch({
    "GET /pulls/pr1/smart-diff": SMART_DIFF,
    "GET /pulls/pr1/reviews": [REVIEW],
    "GET /pulls/pr1/comments": [],
    "GET /pulls/pr1/runs/active": [],
    "POST /findings/:id/:action": (req) => ({ finding: { id: req.params.id } }),
    ...over,
  });
}

function Wrapper({ initialOrder = "smart" as DiffOrder }: { initialOrder?: DiffOrder }) {
  const [order, setOrder] = React.useState<DiffOrder>(initialOrder);
  return <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment order={order} onSetOrder={setOrder} />;
}

describe("DiffTab — Smart order groups", () => {
  it("groups files core -> docs -> boilerplate, lockfile under Boilerplate, docs/boilerplate collapsed", async () => {
    routes();
    const { user } = renderWithProviders(<Wrapper />);

    // Wait for the smart-diff response (all 3 non-empty groups) to render.
    expect(await screen.findByText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();

    // Core is open by default (small diff) — its file is visible.
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    // Boilerplate/docs are collapsed — their files are not rendered yet.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();

    // Expand Boilerplate: the lockfile is inside it.
    await user.click(screen.getByRole("button", { name: /Boilerplate/ }));
    expect(await screen.findByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("shows the group's finding count and an inline Accept posts to the API", async () => {
    const api = routes();
    const { user } = renderWithProviders(<Wrapper />);

    expect(await screen.findByText("● 1")).toBeInTheDocument();
    expect(await screen.findByText("Hardcoded secret")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.requests("POST", "/findings/f1/accept")).toHaveLength(1));
  });

  it("counts and shows findings of every agent's newest review, not an agent's replaced one", async () => {
    const other: FindingRecord = { ...FINDING, id: "f2", severity: "WARNING", title: "Slow query", review_id: "rv2" };
    const replaced: FindingRecord = { ...FINDING, id: "f0", title: "Old finding", review_id: "rv0" };
    routes({
      "GET /pulls/pr1/reviews": [
        REVIEW,
        { ...REVIEW, id: "rv2", agent_id: "a2", agent_name: "Perf", findings: [other] },
        { ...REVIEW, id: "rv0", findings: [replaced] }, // agent a1's older run
      ],
    });
    renderWithProviders(<Wrapper />);

    expect(await screen.findByText("Slow query")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Old finding")).not.toBeInTheDocument();
    // One critical + one warning on Core, each in its own counter.
    expect(screen.getByTitle("1 critical")).toHaveTextContent("● 1");
    expect(screen.getByTitle("1 warning")).toHaveTextContent("● 1");
  });

  it("puts the comments toggle next to the order switch and colours the +/− totals", async () => {
    routes();
    renderWithProviders(<Wrapper />);
    const toggle = await screen.findByRole("button", { name: /Hide comments/ });
    const smart = screen.getByRole("button", { name: "Smart order" });
    expect(toggle.parentElement).toBe(smart.parentElement!.parentElement);
    expect(smart).toHaveAttribute("aria-pressed", "true");
    const summary = screen.getByText(/^3 files/);
    expect(within(summary).getByText("+42")).toHaveStyle({ color: "var(--code-add-text)" });
    expect(within(summary).getByText("−0")).toHaveStyle({ color: "var(--code-del-text)" });
  });

  it("the toggle label counts GitHub comments and current findings together", async () => {
    const comment = {
      id: 7,
      path: "src/config.ts",
      line: 2,
      original_line: 2,
      side: "RIGHT",
      body: "nit",
      user: "octo",
      created_at: "2026-09-01T00:00:00Z",
      html_url: "https://github.com/acme/api/pull/1#r7",
      in_reply_to_id: null,
      is_outdated: false,
    };
    routes({ "GET /pulls/pr1/comments": [comment] });
    const { user } = renderWithProviders(<Wrapper />);
    await user.click(await screen.findByRole("button", { name: "Hide comments (2)" }));
    expect(screen.getByRole("button", { name: "Show comments (2)" })).toBeInTheDocument();
  });

  it("counts findings when there are no GitHub comments", async () => {
    routes();
    renderWithProviders(<Wrapper />);
    expect(await screen.findByRole("button", { name: "Hide comments (1)" })).toBeInTheDocument();
  });

  it("the comments/findings toggle hides the inline card", async () => {
    routes();
    const { user } = renderWithProviders(<Wrapper />);
    expect(await screen.findByText("Hardcoded secret")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Hide comments/ }));
    await waitFor(() => expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument());
  });

  it("a newer review with findings reveals its cards without a reload (toggle not touched)", async () => {
    // Would fail if the toggle default were frozen at the first review
    // (0 findings → hidden) instead of following the latest review.
    let reviews: ReviewRecord[] = [{ ...REVIEW, findings: [] }];
    routes({ "GET /pulls/pr1/reviews": () => reviews });
    const { queryClient } = renderWithProviders(<Wrapper />);
    expect(await screen.findByText("Core")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    reviews = [{ ...REVIEW, id: "rv2", findings: [FINDING] }];
    await queryClient.invalidateQueries();
    expect(await screen.findByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("Smart order opens only files with comments or findings; a click opens the others", async () => {
    routes({ "GET /pulls/pr1/smart-diff": SMART_DIFF_WITH_UTIL });
    const { user } = renderWithProviders(
      <DiffTab prId="pr1" filesCount={4} files={[...FILES, UTIL]} canComment order="smart" onSetOrder={() => {}} />,
    );

    // src/config.ts has a finding → open; src/util.ts is small but uncommented → collapsed.
    expect(await screen.findByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/util.ts")).toBeInTheDocument();
    expect(screen.queryByText("util line")).not.toBeInTheDocument();

    await user.click(screen.getByText("src/util.ts"));
    expect(screen.getByText("util line")).toBeInTheDocument();
  });

  it("Smart order opens a file that has only a GitHub comment", async () => {
    routes({
      "GET /pulls/pr1/smart-diff": SMART_DIFF_WITH_UTIL,
      "GET /pulls/pr1/comments": [
        {
          id: 3,
          path: "src/util.ts",
          line: 2,
          original_line: 2,
          side: "RIGHT",
          body: "rename this",
          user: "octocat",
          created_at: "2026-06-01T00:00:00Z",
          html_url: "https://github.com/x",
          in_reply_to_id: null,
          is_outdated: false,
        },
      ],
    });
    renderWithProviders(
      <DiffTab prId="pr1" filesCount={4} files={[...FILES, UTIL]} canComment order="smart" onSetOrder={() => {}} />,
    );
    expect(await screen.findByText("util line")).toBeInTheDocument();
  });

  it("Original order keeps opening small files regardless of comments", async () => {
    routes();
    renderWithProviders(
      <DiffTab prId="pr1" filesCount={4} files={[...FILES, UTIL]} canComment order="original" onSetOrder={() => {}} />,
    );
    expect(await screen.findByText("util line")).toBeInTheDocument();
  });

  it("Original order renders one flat DiffViewer (no role groups)", async () => {
    routes();
    renderWithProviders(<Wrapper initialOrder="original" />);

    expect(await screen.findByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Core/ })).not.toBeInTheDocument();
  });

  it("shows the no-review notice instead of zero counters", async () => {
    routes({ "GET /pulls/pr1/reviews": [] });
    renderWithProviders(<Wrapper />);
    expect(await screen.findByText("Run a review to see findings here.")).toBeInTheDocument();
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
  });

  it("shows the no-review notice even when GitHub comments exist", async () => {
    routes({
      "GET /pulls/pr1/reviews": [],
      "GET /pulls/pr1/comments": [
        {
          id: 1,
          path: "README.md",
          line: 1,
          original_line: 1,
          side: "RIGHT",
          body: "nit",
          user: "octocat",
          created_at: "2026-06-01T00:00:00Z",
          html_url: "https://github.com/x",
          in_reply_to_id: null,
          is_outdated: false,
        },
      ],
    });
    renderWithProviders(<Wrapper />);
    expect(await screen.findByText("Run a review to see findings here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /comments/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
  });
});
