import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PrFindingsCell } from "./PrFindingsCell";

afterEach(cleanup);

const base = { number: 1, title: "t", author: "a", branch: "b", base: "main", head_sha: "x", additions: 1, deletions: 0, files_count: 1, status: "reviewed" } as PrMeta;

function renderCell(pr: PrMeta) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PrFindingsCell pr={pr} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PrFindingsCell", () => {
  it("shows a dash when the PR has no review, without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCell({ ...base, id: "p1", findings_counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows the latest review's counts", () => {
    renderCell({ ...base, id: "p1", latest_review_id: "rv", findings_counts: { CRITICAL: 0, WARNING: 2, SUGGESTION: 4 } });
    expect(screen.getByLabelText("2 warning, 4 suggestion")).toBeInTheDocument();
  });
});
