import { describe, it, expect, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { PrMeta } from "@/lib/types";
import { PrFindingsCell } from "./PrFindingsCell";

afterEach(cleanup);

const base = { number: 1, title: "t", author: "a", branch: "b", base: "main", head_sha: "x", additions: 1, deletions: 0, files_count: 1, status: "reviewed" } as PrMeta;

function renderCell(pr: PrMeta) {
  return renderWithProviders(<PrFindingsCell pr={pr} />);
}

describe("PrFindingsCell", () => {
  it("shows a dash when the PR has no review, without fetching", () => {
    const api = mockFetch();
    renderCell({ ...base, id: "p1", findings_counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(api.requests()).toHaveLength(0);
  });

  it("shows the latest review's counts", () => {
    renderCell({ ...base, id: "p1", latest_review_id: "rv", findings_counts: { CRITICAL: 0, WARNING: 2, SUGGESTION: 4 } });
    expect(screen.getByLabelText("2 warning, 4 suggestion")).toBeInTheDocument();
  });

  it("the popover lists the findings of every review the counts sum, most severe first", async () => {
    const finding = (id: string, severity: string, review_id: string) => ({
      id, severity, category: "bug", title: `title-${id}`, file: "a.ts", start_line: 1, end_line: 1,
      rationale: "r", suggestion: null, confidence: 0.9, kind: "finding", trifecta_components: null,
      evidence: null, review_id, accepted_at: null, dismissed_at: null,
    });
    const review = (id: string, findings: unknown[]) => ({
      id, pr_id: "p1", agent_id: id, run_id: null, kind: "review", verdict: null, summary: null,
      score: null, model: null, created_at: "2026-06-01T00:00:00Z", findings,
    });
    mockFetch({
      "GET /pulls/p1/reviews": [
        review("rv-new", [finding("s", "SUGGESTION", "rv-new")]),
        review("rv-other", [finding("c", "CRITICAL", "rv-other")]),
        review("rv-old", [finding("stale", "WARNING", "rv-old")]),
      ],
    });
    const { user } = renderCell({
      ...base,
      id: "p1",
      latest_review_id: "rv-new",
      latest_review_ids: ["rv-new", "rv-other"],
      findings_counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 1 },
    });
    await user.hover(screen.getByLabelText("1 critical, 1 suggestion"));
    const tooltip = await screen.findByRole("tooltip");
    await screen.findByText("title-c");
    const titles = [...tooltip.querySelectorAll("span")].map((n) => n.textContent).filter((x) => x?.startsWith("title-"));
    expect(titles).toEqual(["title-c", "title-s"]);
  });
});
