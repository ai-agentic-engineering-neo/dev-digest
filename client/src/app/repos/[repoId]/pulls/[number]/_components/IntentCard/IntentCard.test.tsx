import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import helpMessages from "../../../../../../../../messages/en/help.json";
import * as hooks from "@/lib/hooks/intent";
import type { Intent } from "@/lib/hooks/intent";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ intent: intentMessages, help: helpMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  return render(wrap(ui));
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

  it("renders the summary plus both IN SCOPE / OUT OF SCOPE lists (with counts) when populated", () => {
    mockIntent({
      summary: "Adds rate limiting to the public API endpoints.",
      inScope: ["Rate limiter middleware", "Config for limiter thresholds"],
      outOfScope: ["Authentication changes"],
      contextGaps: [],
      signals: [],
    });
    mockRecalculate();
    renderWithProviders(<IntentCard prId="pr1" />);
    expect(screen.getByText("Adds rate limiting to the public API endpoints.")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
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
    expect(screen.getByRole("note")).toHaveTextContent("Limited context");
    expect(screen.getByText("PR description is empty or near-empty")).toBeInTheDocument();

    mockIntent({
      summary: "Unclear from available signals.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: [],
    });
    rerender(wrap(<IntentCard prId="pr1" />));
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
    expect(screen.getByText("Derived from")).toBeInTheDocument();
    expect(screen.getByText("PR title")).toBeInTheDocument();
    expect(screen.getByText("commit messages")).toBeInTheDocument();

    mockIntent({
      summary: "Adds rate limiting to the public API endpoints.",
      inScope: [],
      outOfScope: [],
      contextGaps: [],
      signals: [],
    });
    rerender(wrap(<IntentCard prId="pr1" />));
    expect(screen.queryByText(/Derived from/)).not.toBeInTheDocument();
  });

  it("collapses a long scope list behind 'Show all N' and expands it on click", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Item ${i + 1}`);
    mockIntent({ summary: "Big PR.", inScope: many, outOfScope: [], contextGaps: [], signals: [] });
    mockRecalculate();
    renderWithProviders(<IntentCard prId="pr1" />);
    expect(screen.getByText("Item 6")).toBeInTheDocument();
    expect(screen.queryByText("Item 7")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 9" }));
    expect(screen.getByText("Item 9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("Item 9")).not.toBeInTheDocument();
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
