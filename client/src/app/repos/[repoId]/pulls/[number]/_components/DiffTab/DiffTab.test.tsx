import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { PrFile, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const smartDiff: SmartDiffResponse = {
  split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [] },
  groups: [
    { role: "core", files: [{ path: "src/core.ts", additions: 5, deletions: 1, finding_lines: [2] }] },
    { role: "tests", files: [{ path: "src/core.test.ts", additions: 3, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "src/app.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 2, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 9, deletions: 9, finding_lines: [] }] },
  ],
};

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => ({ data: smartDiff }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

const patch = "@@ -1,1 +1,2 @@\n a\n+b";
// GitHub order deliberately differs from the smart order.
const files: PrFile[] = [
  "README.md",
  "pnpm-lock.yaml",
  "src/app.ts",
  "src/core.test.ts",
  "src/core.ts",
].map((path) => ({ path, additions: 1, deletions: 0, patch }) as PrFile);

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="pr1" filesCount={5} files={files} reviews={[]} headSha="abc" repoFullName="o/r" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const groupHeaders = () =>
  screen.queryAllByRole("button", { expanded: undefined }).filter((b) => b.hasAttribute("aria-expanded"));

describe("DiffTab smart order", () => {
  it("groups by role, collapses docs/boilerplate, and switches back to original order", async () => {
    renderTab();

    const headers = groupHeaders();
    expect(headers.map((h) => /^(Core logic|Tests|Wiring|Docs|Boilerplate)/.exec(h.textContent ?? "")?.[1])).toEqual([
      "Core logic",
      "Tests",
      "Wiring",
      "Docs",
      "Boilerplate",
    ]);
    const [core, , , docs, boiler] = headers as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(docs).toHaveAttribute("aria-expanded", "false");
    expect(boiler).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    expect(within(core).getByLabelText("1 files with findings")).toBeInTheDocument();
    expect(within(core).getByText("1 files")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /finding/i })).toHaveLength(1);

    fireEvent.click(boiler);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Original order" }));
    expect(groupHeaders()).toHaveLength(0);
    const paths = screen.getAllByText(/\.(md|ts|yaml)$/).map((e) => e.textContent);
    expect(paths).toEqual(files.map((f) => f.path));

    fireEvent.click(screen.getByRole("radio", { name: "Smart order" }));
    expect(groupHeaders()).toHaveLength(5);
  });
});
