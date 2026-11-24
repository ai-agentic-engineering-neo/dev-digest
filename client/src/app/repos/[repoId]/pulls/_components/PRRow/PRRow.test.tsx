import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "p1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/x",
    base: "main",
    head_sha: "abc",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "reviewed",
    opened_at: null,
    updated_at: null,
    score: 61,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the total run cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByTestId("pr-cost")).toHaveTextContent("$0.014");
  });
  it("shows an em dash when cost is unknown or the PR has no runs", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByTestId("pr-cost")).toHaveTextContent("—");
  });
});
