import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "p1",
    repo_id: "r1",
    category: "naming",
    rule: "Pending rule",
    rationale: null,
    evidence_path: "src/a.ts",
    evidence_line: 1,
    evidence_snippet: "const a = 1;",
    confidence: 0.8,
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a1",
    repo_id: "r1",
    category: "structure",
    rule: "Accepted rule",
    rationale: null,
    evidence_path: "src/b.ts",
    evidence_line: 2,
    evidence_snippet: "const b = 2;",
    confidence: 0.9,
    status: "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

const refetch = vi.fn();
const extractMutateAsync = vi.fn().mockResolvedValue({
  candidates: CANDIDATES,
  sampled_files: ["src/a.ts"],
  proposed: 2,
  dropped_ungrounded: 0,
  dropped_duplicate: 0,
  model: "gpt-5.4",
  cost_usd: 0.001,
});
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

let conventionsData: ConventionCandidate[] | undefined = [];
let isLoading = false;
let isError = false;

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: conventionsData, isLoading, isError, refetch }),
  useExtractConventions: () => ({ mutateAsync: extractMutateAsync, isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteConvention: () => ({ mutate: deleteMutate, isPending: false }),
  useConventionSkillDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ConventionsPage from "./page";

afterEach(() => {
  cleanup();
  conventionsData = [];
  isLoading = false;
  isError = false;
  extractMutateAsync.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsPage />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsPage (smoke)", () => {
  it("shows the empty state before any scan, and running extraction calls the extract mutation", async () => {
    renderWithIntl();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    // "Run extraction" appears both in the header button and the empty-state
    // CTA — both trigger the same scan, so either works; use the header one.
    await act(async () => {
      fireEvent.click(screen.getAllByText("Run extraction")[0]!);
    });
    expect(extractMutateAsync).toHaveBeenCalledWith("r1");
  });

  it("renders candidates and defaults the filter to pending", () => {
    conventionsData = CANDIDATES;
    renderWithIntl();
    expect(screen.getByText("Pending rule")).toBeInTheDocument();
    expect(screen.queryByText("Accepted rule")).not.toBeInTheDocument();
  });

  it("switching the filter to Accepted shows the accepted candidate instead", () => {
    conventionsData = CANDIDATES;
    renderWithIntl();
    fireEvent.click(screen.getByText("Accepted"));
    expect(screen.getByText("Accepted rule")).toBeInTheDocument();
    expect(screen.queryByText("Pending rule")).not.toBeInTheDocument();
  });

  it("switching the filter to All shows every candidate", () => {
    conventionsData = CANDIDATES;
    renderWithIntl();
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText("Pending rule")).toBeInTheDocument();
    expect(screen.getByText("Accepted rule")).toBeInTheDocument();
  });

  it("renders an error state with retry when loading fails", () => {
    conventionsData = undefined;
    isError = true;
    renderWithIntl();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });
});
