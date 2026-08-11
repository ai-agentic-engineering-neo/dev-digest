import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as hooks from "@/lib/hooks/intent";
import * as blastHooks from "@/lib/hooks/blast-radius";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockIntent() {
  vi.spyOn(hooks, "useIntent").mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useIntent>);
  vi.spyOn(hooks, "useRecalculateIntent").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useRecalculateIntent>);
}

function mockBlastRadius() {
  vi.spyOn(blastHooks, "useBlastRadius").mockReturnValue({
    data: { status: "full", data: { changed_symbols: [], downstream: [] } },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof blastHooks.useBlastRadius>);
}

describe("OverviewTab", () => {
  it("renders the IntentCard and BlastRadiusCard side by side (own components — not inline)", () => {
    mockIntent();
    mockBlastRadius();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} />);
    expect(
      screen.getByText("Not yet analyzed — intent is computed on the next review run."),
    ).toBeInTheDocument();
    expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
  });

  it("renders the PR body as a Description section when present", () => {
    mockIntent();
    mockBlastRadius();

    renderWithProviders(<OverviewTab prId="pr1" prBody="Fixes the thing." />);
    expect(screen.getByText("Fixes the thing.")).toBeInTheDocument();
  });
});
