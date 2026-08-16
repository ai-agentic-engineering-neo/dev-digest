import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import * as hooks from "@/lib/hooks/intent";
import * as blastHooks from "@/lib/hooks/blast-radius";
import * as briefHooks from "@/lib/hooks/brief";
import * as toastLib from "@/lib/toast";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { OverviewTab } from "./OverviewTab";

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

afterEach(cleanup);

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
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

function mockBrief() {
  vi.spyOn(briefHooks, "useBrief").mockReturnValue({
    data: { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "sha1", stale_markers: [] },
    isLoading: false,
  } as unknown as ReturnType<typeof briefHooks.useBrief>);
  vi.spyOn(briefHooks, "useGenerateBrief").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefHooks.useGenerateBrief>);
}

/** A brief WITH a review-focus entry — needed to exercise the
 *  onFocusFile-forwarding test below (mockBrief()'s `status: "none"` fixture
 *  has no review-focus items to click). */
function mockGeneratedBriefWithFocusEntry() {
  vi.spyOn(briefHooks, "useBrief").mockReturnValue({
    data: {
      status: "generated",
      reason: null,
      current_head_sha: "sha-head",
      stale_markers: [],
      provenance: {
        head_sha: "sha-head",
        generated_at: "2026-08-13T00:00:00Z",
        model: "gpt-4.1",
        provider: "openai",
        attempts: 1,
        tokens_in: 10,
        tokens_out: 10,
        cost_usd: 0.01,
        index_sha: "idx",
        index_status: "full",
        index_reason: null,
        intent_resolved_at: null,
        dropped_inputs: 0,
      },
      brief: {
        what: "Adds a thing.",
        why: "Because.",
        risk_level: "low",
        risks: [],
        review_focus: [{ file: "src/a.ts", line: 10, reason: "Core change." }],
      },
    },
    isLoading: false,
  } as unknown as ReturnType<typeof briefHooks.useBrief>);
  vi.spyOn(briefHooks, "useGenerateBrief").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefHooks.useGenerateBrief>);
}

describe("OverviewTab", () => {
  it("renders the IntentCard and BlastRadiusCard side by side (own components — not inline)", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} />);
    expect(
      screen.getByText("Not yet analyzed — intent is computed on the next review run."),
    ).toBeInTheDocument();
    expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
  });

  it("renders the PR body as a Description section when present", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody="Fixes the thing." />);
    expect(screen.getByText("Fixes the thing.")).toBeInTheDocument();
  });

  it("Q8/AC-36: the brief section renders ABOVE the Intent/Blast grid, with Description last", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody="Fixes the thing." />);

    const briefLabel = screen.getByText("Why + Risk Brief");
    const intentText = screen.getByText("Not yet analyzed — intent is computed on the next review run.");
    const blastText = screen.getByText("No blast radius to show");
    const descriptionText = screen.getByText("Fixes the thing.");

    // DOCUMENT_POSITION_FOLLOWING: the argument node comes AFTER the node
    // `compareDocumentPosition` is called on — asserts DOM order, not mere
    // presence, matching this test-matrix row's "DOM-order assertion" ask.
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(briefLabel.compareDocumentPosition(intentText) & FOLLOWING).toBeTruthy();
    expect(intentText.compareDocumentPosition(blastText) & FOLLOWING).toBeTruthy();
    expect(blastText.compareDocumentPosition(descriptionText) & FOLLOWING).toBeTruthy();
  });

  it("forwards onFocusFile through to PrBriefCard, so a review-focus click reaches OverviewTab's caller", () => {
    mockIntent();
    mockBlastRadius();
    mockGeneratedBriefWithFocusEntry();
    const onFocusFile = vi.fn();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} onFocusFile={onFocusFile} />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a\.ts:10/ }));

    expect(onFocusFile).toHaveBeenCalledWith("src/a.ts", 10);
  });
});
