import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Repo } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";

const refreshMutate = vi.fn();
const extractMutate = vi.fn();
const NOT_CLONED: Repo = {
  id: "r1", workspace_id: "w", owner: "acme", name: "payments-api", full_name: "acme/payments-api",
  default_branch: "main", clone_path: null, last_polled_at: null, created_by: null,
};
const CLONED: Repo = { ...NOT_CLONED, clone_path: "/clones/acme/payments-api" };
const repoCtx = { activeRepo: NOT_CLONED as Repo };
// Stable query results (a fresh object per render would loop effects).
const EMPTY_Q = { data: { scan: null, candidates: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() };
const extractQ = { mutate: extractMutate, isPending: false };
const statusQ = { mutate: vi.fn() };
const refreshQ = { mutate: refreshMutate, isPending: false };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => repoCtx, useRepoNotFound: () => false }));
vi.mock("@/lib/hooks", () => ({ useRefreshRepo: () => refreshQ }));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => EMPTY_Q,
  useExtractConventions: () => extractQ,
  useSetConventionStatus: () => statusQ,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  refreshMutate.mockReset();
  extractMutate.mockReset();
});

function renderView() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ conventions }}>
        <ConventionsView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("explains a missing clone up front and offers to clone instead of extracting", () => {
    repoCtx.activeRepo = NOT_CLONED;
    renderView();
    expect(screen.getByText("This repo isn't cloned yet")).toBeInTheDocument();
    expect(screen.queryByText("Run extraction")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Clone repo"));
    expect(refreshMutate).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("offers extraction once the repo is cloned", () => {
    repoCtx.activeRepo = CLONED;
    renderView();
    fireEvent.click(screen.getByText("Run extraction"));
    expect(extractMutate).toHaveBeenCalled();
  });
});
