import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import * as hooks from "@/lib/hooks/intent";
import * as blastHooks from "@/lib/hooks/blast-radius";
import * as briefHooks from "@/lib/hooks/brief";
import * as toastLib from "@/lib/toast";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import helpMessages from "../../../../../../../../messages/en/help.json";
import impactMessages from "../../../../../../../../messages/en/impactGraph.json";
import graphMessages from "../../../../../../../../messages/en/graph.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import overviewMessages from "../../../../../../../../messages/en/overview.json";
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
      <NextIntlClientProvider locale="en" messages={{
          brief: briefMessages,
          impactGraph: impactMessages,
          graph: graphMessages,
          intent: intentMessages,
          overview: overviewMessages,
          help: helpMessages,
        }}>
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
  it("shows the at-a-glance cards as a tablist and only the selected section (brief by default)", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody="Fixes the thing." />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Risk brief"),
      expect.stringContaining("Intent"),
      expect.stringContaining("Blast radius"),
      expect.stringContaining("Description"),
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Why + Risk Brief")).toBeInTheDocument();
    expect(screen.queryByText("Not yet analyzed — intent is computed on the next review run.")).not.toBeInTheDocument();
    // the glance card summarises the description without rendering the section
    expect(screen.getByRole("tab", { name: /Description/ })).toHaveTextContent("Fixes the thing.");
    expect(screen.getByRole("tab", { name: /Description/ })).toHaveTextContent("3 words");
  });

  it("switches sections from the cards and reports the choice when controlled", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();
    const onSectionChange = vi.fn();

    const { rerender } = renderWithProviders(
      <OverviewTab prId="pr1" prBody="Fixes the thing." onSectionChange={onSectionChange} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Blast radius/ }));
    expect(onSectionChange).toHaveBeenCalledWith("blast");

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider
          locale="en"
          messages={{
            brief: briefMessages,
            impactGraph: impactMessages,
            graph: graphMessages,
            intent: intentMessages,
            overview: overviewMessages,
            help: helpMessages,
          }}
        >
          <OverviewTab prId="pr1" prBody="Fixes the thing." section="intent" onSectionChange={onSectionChange} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("tab", { name: /Intent/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Not yet analyzed — intent is computed on the next review run.")).toBeInTheDocument();
  });

  it("uncontrolled: clicking a card renders that section (Intent, Blast Radius)", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /Intent/ }));
    expect(screen.getByText("Not yet analyzed — intent is computed on the next review run.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Blast radius/ }));
    expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "overview-tab-blast");
  });

  it("renders the PR body as Markdown and drops PR-template HTML comments", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    const body = "## Summary\n\nA **bold** change.\n\n<!-- drop demo.mp4 here -->\n\n- one\n- `two`";
    renderWithProviders(<OverviewTab prId="pr1" prBody={body} section="description" />);
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { level: 2, name: "Summary" })).toBeInTheDocument();
    expect(within(panel).getByText("bold").tagName).toBe("STRONG");
    expect(within(panel).getByText("two").tagName).toBe("CODE");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
    expect(panel).not.toHaveTextContent("drop demo.mp4");
  });

  it("keeps GitHub-style single line breaks in the description", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    const { container } = renderWithProviders(
      <OverviewTab prId="pr1" prBody={"Spec: a.md\nCovers: AC-1"} section="description" />,
    );
    expect(container.querySelector(".dd-md br")).not.toBeNull();
  });

  it("shows an empty description state instead of a blank box", () => {
    mockIntent();
    mockBlastRadius();
    mockBrief();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} section="description" />);
    expect(within(screen.getByRole("tabpanel")).getByText("No description")).toBeInTheDocument();
  });

  it("forwards onFocusFile through to PrBriefCard, so a review-focus click reaches OverviewTab's caller", () => {
    mockIntent();
    mockBlastRadius();
    mockGeneratedBriefWithFocusEntry();
    const onFocusFile = vi.fn();

    renderWithProviders(<OverviewTab prId="pr1" prBody={null} onFocusFile={onFocusFile} />);
    // the glance card reflects the generated brief
    expect(screen.getByRole("tab", { name: /Risk brief/ })).toHaveTextContent("LOW");
    expect(screen.getByRole("tab", { name: /Risk brief/ })).toHaveTextContent("0 risk areas · 1 focus point");
    fireEvent.click(screen.getByRole("button", { name: /src\/a\.ts:10/ }));

    expect(onFocusFile).toHaveBeenCalledWith("src/a.ts", 10);
  });
});
