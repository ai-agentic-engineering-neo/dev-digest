import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_PR: PrMeta = {
  id: "pr1",
  number: 7,
  title: "Add findings column",
  author: "marisa.koch",
  branch: "feat/findings",
  base: "main",
  head_sha: "sha1",
  additions: 10,
  deletions: 2,
  files_count: 3,
  status: "needs_review",
  opened_at: null,
  updated_at: "2026-09-21T10:00:00.000Z",
  score: 80,
  cost_usd: 0.02,
  findings: null,
};

describe("PRRow", () => {
  it("shows the FINDINGS column's placeholder when the row has none", () => {
    renderWithIntl(<PRRow pr={BASE_PR} repoId="repo1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the row's severity breakdown in the FINDINGS column", () => {
    const pr: PrMeta = {
      ...BASE_PR,
      findings: {
        counts: { CRITICAL: 1, WARNING: 2 },
        total: 3,
        previews: [],
      },
    };
    renderWithIntl(<PRRow pr={pr} repoId="repo1" />);
    expect(screen.getByTestId("findings-cell")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
