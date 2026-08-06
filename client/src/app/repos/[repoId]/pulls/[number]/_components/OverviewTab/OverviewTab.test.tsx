import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as hooks from "@/lib/hooks/intent";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("OverviewTab", () => {
  it("renders the IntentCard (own component — not inline in OverviewTab)", () => {
    vi.spyOn(hooks, "useIntent").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useIntent>);
    vi.spyOn(hooks, "useRecalculateIntent").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useRecalculateIntent>);

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} />);
    expect(
      screen.getByText("Not yet analyzed — intent is computed on the next review run."),
    ).toBeInTheDocument();
  });

  it("renders the PR body as a Description section when present", () => {
    vi.spyOn(hooks, "useIntent").mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useIntent>);
    vi.spyOn(hooks, "useRecalculateIntent").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useRecalculateIntent>);

    renderWithProviders(<OverviewTab prId="pr1" prBody="Fixes the thing." />);
    expect(screen.getByText("Fixes the thing.")).toBeInTheDocument();
  });
});
