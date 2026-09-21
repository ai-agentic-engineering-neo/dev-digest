import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as hooks from "@/lib/hooks/intent";
import type { Intent } from "@/lib/hooks/intent";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockIntent(data: Intent | undefined) {
  vi.spyOn(hooks, "useIntent").mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useIntent>);
}

function mockRecalculate(overrides?: Partial<ReturnType<typeof hooks.useRecalculateIntent>>) {
  vi.spyOn(hooks, "useRecalculateIntent").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof hooks.useRecalculateIntent>);
}

describe("IntentCard (specs/05-intent-layer.md revision 2)", () => {
  it("shows the empty state before a review run has computed an intent", () => {
    mockIntent(undefined);
    mockRecalculate();
    renderWithProviders(<IntentCard prId="pr1" />);
    expect(
      screen.getByText("Not yet analyzed — intent is computed on the next review run."),
    ).toBeInTheDocument();
  });

  it("renders the summary quote plus both IN SCOPE / OUT OF SCOPE lists when populated", () => {
    mockIntent({
      summary: "Adds rate limiting to the public API endpoints.",
      inScope: ["Rate limiter middleware", "Config for limiter thresholds"],
      outOfScope: ["Authentication changes"],
      contextGaps: [],
      signals: [],
    });
    mockRecalculate();
    renderWithProviders(<IntentCard prId="pr1" />);
    expect(screen.getByText("“Adds rate limiting to the public API endpoints.”")).toBeInTheDocument();
    expect(screen.getByText("✓ IN SCOPE")).toBeInTheDocument();
    expect(screen.getByText("✗ OUT OF SCOPE")).toBeInTheDocument();
    expect(screen.getByText("Rate limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Config for limiter thresholds")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
    // no confidence badge/text anywhere (v1 behaviour removed)
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it("shows 'Nothing stated' for whichever list is empty", () => {
    mockIntent({
      summary: "Fixes a typo in the README.",
      inScope: ["Typo fix in README.md"],
      outOfScope: [],
      contextGaps: null,
      signals: null,
    });
    mockRecalculate();
    renderWithProviders(<IntentCard prId="pr1" />);
    expect(screen.getAllByText("Nothing stated")).toHaveLength(1);
  });

  it("renders the Limited context warning line when contextGaps is non-empty, and omits it when absent", () => {
    mockIntent({
      summary: "Unclear from available signals.",
      inScope: [],
      outOfScope: [],
      contextGaps: ["PR description is empty or near-empty"],
      signals: [],
    });
    mockRecalculate();
    const { rerender } = renderWithProviders(<IntentCard prId="pr1" />);
    expect(
      screen.getByText("⚠ Limited context: PR description is empty or near-empty"),
    ).toBeInTheDocument();

    mockIntent({
      summary: "Unclear from available signals.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: [],
    });
    const qc = new QueryClient();
    rerender(
      <QueryClientProvider client={qc}>
        <IntentCard prId="pr1" />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/Limited context/)).not.toBeInTheDocument();
  });

  it("renders the 'Derived from' line when signals is non-empty, and omits it when empty", () => {
    mockIntent({
      summary: "Adds rate limiting to the public API endpoints.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: ["PR title", "commit messages"],
    });
    mockRecalculate();
    const { rerender } = renderWithProviders(<IntentCard prId="pr1" />);
    expect(screen.getByText("Derived from: PR title, commit messages")).toBeInTheDocument();

    mockIntent({
      summary: "Adds rate limiting to the public API endpoints.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: [],
    });
    const qc = new QueryClient();
    rerender(
      <QueryClientProvider client={qc}>
        <IntentCard prId="pr1" />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/Derived from/)).not.toBeInTheDocument();
  });

  it("calls useRecalculateIntent's mutate when Recalculate is clicked", () => {
    mockIntent({
      summary: "Adds rate limiting.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: [],
    });
    const mutate = vi.fn();
    mockRecalculate({ mutate });
    renderWithProviders(<IntentCard prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /recalculate/i }));
    expect(mutate).toHaveBeenCalled();
  });
});
