import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
import type { PrMeta } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add payments idempotency key",
    author: "alice",
    branch: "feat/payments",
    base: "main",
    head_sha: "abc123",
    additions: 40,
    deletions: 5,
    files_count: 3,
    status: "needs_review",
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    score: 82,
    cost_usd: 0.012,
    ...overrides,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow cost cell", () => {
  it("shows the formatted cost when cost_usd is present", () => {
    renderRow(pr({ cost_usd: 0.012 }));
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("shows em-dash when cost_usd is null", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
