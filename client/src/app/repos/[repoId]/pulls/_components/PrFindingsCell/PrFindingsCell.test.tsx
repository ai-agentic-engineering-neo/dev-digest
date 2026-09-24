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
});
