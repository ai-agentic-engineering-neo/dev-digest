import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import type { PrMeta } from "@/lib/types";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const PR: PrMeta = {
  id: "p1",
  number: 482,
  title: "Add rate limiting",
  author: "marisa.koch",
  branch: "feat/rl",
  base: "main",
  head_sha: "a1b2c3d4",
  additions: 10,
  deletions: 2,
  files_count: 1,
  status: "reviewed",
  opened_at: null,
  updated_at: null,
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow cost cell", () => {
  it("shows the latest run's cost compactly", () => {
    renderRow({ ...PR, score: 65, cost_usd: 0.0123 });
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("shows a dash, not $0.00, when cost is unknown", () => {
    renderRow({ ...PR, score: 65, cost_usd: null });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
