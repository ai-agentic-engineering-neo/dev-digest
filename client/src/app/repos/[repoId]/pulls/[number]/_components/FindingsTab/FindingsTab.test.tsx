/**
 * FindingsTab — the props it hands DOWN to each ReviewRunAccordion.
 *
 * Two behaviours are guarded here because neither is visible from any single
 * child component:
 *   - navigating to ONE run (Timeline → Review runs) must not touch any other
 *     already-open accordion's own severity filter;
 *   - `has_trace` is optional, and a MISSING value means "assume a trace may
 *     exist" (the contract's own wording) — the same rule RunHistory applies.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { GO_TO_REVIEW_CLASS } from "../RunHistory/styles";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvents: () => ({ events: [], running: false }),
}));

import { FindingsTab } from "./FindingsTab";

beforeAll(() => {
  // The accordion scrolls itself into view on a navigation; jsdom has no impl.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: Math.random().toString(36),
    severity: "WARNING",
    category: "style",
    title: "A finding",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "rv-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv-1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Agent One",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 42,
    model: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

function run(o: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Agent One",
    provider: "openrouter",
    model: "m",
    status: "done",
    error: null,
    duration_ms: 12,
    tokens_in: 10,
    tokens_out: 10,
    findings_count: 2,
    grounding: null,
    ran_at: "2026-06-11T18:44:34.000Z",
    score: 42,
    blockers: 1,
    cost_usd: null,
    ...o,
  };
}

/** `cancelMutation` is only ever `.mutate()`d from the live-run banner, which
 *  never renders in these tests (liveRunIds is empty). */
const cancelMutation = { mutate: vi.fn(), isPending: false } as never;

function renderTab(props: Partial<React.ComponentProps<typeof FindingsTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={cancelMutation}
        onOpenTrace={vi.fn()}
        onDelete={vi.fn()}
        onRunDone={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** Two reviewed runs, each with one CRITICAL + one WARNING finding. run-1 is
 *  the NEWER one, so it sorts first and is the default-open accordion. */
const RUNS: ReviewRecord[] = [
  review({
    id: "rv-1",
    run_id: "run-1",
    agent_name: "Agent One",
    created_at: "2026-06-11T18:00:00.000Z",
    findings: [
      finding({ id: "f1c", severity: "CRITICAL", title: "R1 critical" }),
      finding({ id: "f1w", severity: "WARNING", title: "R1 warning" }),
    ],
  }),
  review({
    id: "rv-2",
    run_id: "run-2",
    agent_name: "Agent Two",
    created_at: "2026-06-11T17:00:00.000Z",
    findings: [
      finding({ id: "f2c", severity: "CRITICAL", title: "R2 critical" }),
      finding({ id: "f2w", severity: "WARNING", title: "R2 warning" }),
    ],
  }),
];

const PR_RUNS: RunSummary[] = [
  run({ run_id: "run-1", agent_name: "Agent One", ran_at: "2026-06-11T18:00:00.000Z" }),
  run({ run_id: "run-2", agent_name: "Agent Two", ran_at: "2026-06-11T17:00:00.000Z" }),
];

/** The accordion body for a given run (it carries `id="review-run-<id>"`). */
function accordion(container: HTMLElement, runId: string): HTMLElement {
  return container.querySelector(`#review-run-${runId}`) as HTMLElement;
}

/** The Timeline row's own widgets for a run — scoped so the accordion header's
 *  identically-labelled chips below can't be picked up by accident. */
function timelineRow(container: HTMLElement, index: number): HTMLElement {
  const goTo = container.querySelectorAll(`.${GO_TO_REVIEW_CLASS}`)[index] as HTMLElement;
  return goTo.closest("div")!.parentElement as HTMLElement;
}

describe("FindingsTab — severity filters are per-accordion, never cross-contaminated", () => {
  it("navigating to one run leaves another open accordion's own severity filter alone", () => {
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS });

    // Open the second (older) accordion — only the newest is open by default.
    const twoRoot = accordion(container, "run-2");
    fireEvent.click(within(twoRoot).getByLabelText("Expand this run"));
    expect(within(twoRoot).getByText("R2 critical")).toBeInTheDocument();

    // The user filters THAT accordion down to WARNING, locally.
    fireEvent.click(within(twoRoot).getByText("WARNING").closest("button")!);
    expect(within(twoRoot).getByText("R2 warning")).toBeInTheDocument();
    expect(within(twoRoot).queryByText("R2 critical")).not.toBeInTheDocument();

    // Now they navigate to a DIFFERENT run from the Timeline (nonce bumps).
    fireEvent.click(timelineRow(container, 0).querySelector(`.${GO_TO_REVIEW_CLASS}`)!);

    // run-2's filter must survive untouched — this is the regression.
    const twoAfter = accordion(container, "run-2");
    expect(within(twoAfter).getByText("R2 warning")).toBeInTheDocument();
    expect(within(twoAfter).queryByText("R2 critical")).not.toBeInTheDocument();
  });

  it("a Timeline severity chip filters ONLY its own run's accordion", () => {
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS });

    const twoRoot = accordion(container, "run-2");
    fireEvent.click(within(twoRoot).getByLabelText("Expand this run"));
    fireEvent.click(within(twoRoot).getByText("WARNING").closest("button")!);
    expect(within(twoRoot).queryByText("R2 critical")).not.toBeInTheDocument();

    // Timeline row 0 is run-1 (newest first); its CRITICAL chip is the first
    // popover trigger in that row.
    const chips = within(timelineRow(container, 0))
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-haspopup") === "true");
    fireEvent.click(chips[0]!);

    // run-1 IS the target: it gets the CRITICAL filter.
    const oneAfter = accordion(container, "run-1");
    expect(within(oneAfter).getByText("R1 critical")).toBeInTheDocument();
    expect(within(oneAfter).queryByText("R1 warning")).not.toBeInTheDocument();
    // run-2 is not the target: still on its own WARNING filter.
    const twoAfter = accordion(container, "run-2");
    expect(within(twoAfter).getByText("R2 warning")).toBeInTheDocument();
    expect(within(twoAfter).queryByText("R2 critical")).not.toBeInTheDocument();
  });

  it("keeps a run's own filter when a DIFFERENT run becomes the target AFTER it was one", () => {
    // The mirror of the test above, and the case an `isTarget` check computed
    // fresh on every target change gets wrong: once run-2 HAS been a target its
    // panel key is live, so flipping `isTarget` back to false would revert that
    // key to its inert default and remount the panel — wiping the filter the
    // user set by hand afterwards.
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS });

    const twoRoot = accordion(container, "run-2");
    fireEvent.click(within(twoRoot).getByLabelText("Expand this run"));

    // 1. run-2 becomes the target, filtered to CRITICAL from its Timeline chip.
    const twoChips = within(timelineRow(container, 1))
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-haspopup") === "true");
    fireEvent.click(twoChips[0]!);
    expect(within(accordion(container, "run-2")).getByText("R2 critical")).toBeInTheDocument();
    expect(within(accordion(container, "run-2")).queryByText("R2 warning")).not.toBeInTheDocument();

    // 2. The user then re-filters run-2 to WARNING with its OWN pill.
    const twoNow = accordion(container, "run-2");
    fireEvent.click(within(twoNow).getByText("WARNING").closest("button")!);
    expect(within(accordion(container, "run-2")).getByText("R2 warning")).toBeInTheDocument();

    // 3. Navigating to run-1 must leave run-2's own WARNING filter alone.
    fireEvent.click(timelineRow(container, 0).querySelector(`.${GO_TO_REVIEW_CLASS}`)!);
    const twoAfter = accordion(container, "run-2");
    expect(within(twoAfter).getByText("R2 warning")).toBeInTheDocument();
    expect(within(twoAfter).queryByText("R2 critical")).not.toBeInTheDocument();
  });

  it("keeps a panel's own hide-low-confidence toggle across a navigation re-trigger", () => {
    const LOW = finding({ id: "f1low", severity: "SUGGESTION", title: "R1 hunch", confidence: 0.4 });
    const runsWithLow: ReviewRecord[] = [
      review({ ...RUNS[0]!, findings: [...RUNS[0]!.findings, LOW] }),
      RUNS[1]!,
    ];
    const { container } = renderTab({ runs: runsWithLow, prRuns: PR_RUNS });

    const oneRoot = accordion(container, "run-1");
    fireEvent.click(within(oneRoot).getByRole("switch"));
    expect(within(oneRoot).queryByText("R1 hunch")).not.toBeInTheDocument();

    // Re-trigger on this very run — the severity filter is meant to be
    // replaced, `hideLow` is the user's own choice and must NOT reset.
    fireEvent.click(timelineRow(container, 0).querySelector(`.${GO_TO_REVIEW_CLASS}`)!);
    const oneAfter = accordion(container, "run-1");
    expect(within(oneAfter).queryByText("R1 hunch")).not.toBeInTheDocument();
    expect(within(oneAfter).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("FindingsTab — an accordion header's own severity badge", () => {
  /** The header's severity chips (the pills below have no aria-haspopup). */
  function headerChips(root: HTMLElement): HTMLElement[] {
    return within(root)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-haspopup") === "true");
  }

  it("filters its OWN panel immediately, exactly as reloading the URL it writes would", () => {
    const onTargetChange = vi.fn();
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS, onTargetChange });

    // run-1 is the newest, so its accordion is open by default.
    const oneRoot = accordion(container, "run-1");
    fireEvent.click(headerChips(oneRoot)[0]!); // CRITICAL

    expect(onTargetChange).toHaveBeenCalledWith("run-1", "CRITICAL");
    const oneAfter = accordion(container, "run-1");
    // The popover this click also pins is portaled to <body>, so these scoped
    // queries see only the panel's own finding cards.
    expect(within(oneAfter).getByText("R1 critical")).toBeInTheDocument();
    expect(within(oneAfter).queryByText("R1 warning")).not.toBeInTheDocument();
  });

  it("does not disturb another run's filter", () => {
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS });
    const twoRoot = accordion(container, "run-2");
    fireEvent.click(within(twoRoot).getByLabelText("Expand this run"));
    fireEvent.click(within(twoRoot).getByText("WARNING").closest("button")!);

    fireEvent.click(headerChips(accordion(container, "run-1"))[0]!);

    const twoAfter = accordion(container, "run-2");
    expect(within(twoAfter).getByText("R2 warning")).toBeInTheDocument();
    expect(within(twoAfter).queryByText("R2 critical")).not.toBeInTheDocument();
  });
});

describe("FindingsTab — merely expanding an accordion is not a navigation", () => {
  it("does not clear a ?severity= that belongs to a different, currently-filtered run", () => {
    const onTargetChange = vi.fn();
    const { container } = renderTab({
      runs: RUNS,
      prRuns: PR_RUNS,
      // Arrived via a shared link: run-1 is the target AND owns ?severity=.
      initialAgentRunId: "run-1",
      initialSeverity: "CRITICAL",
      onTargetChange,
    });

    // The user just toggles the OTHER accordion open, unrelated to any severity.
    fireEvent.click(within(accordion(container, "run-2")).getByLabelText("Expand this run"));

    // run-1's severity param is not theirs to clear, so the URL is left alone.
    expect(onTargetChange).not.toHaveBeenCalled();
    // …and run-1's own panel stays filtered.
    const oneAfter = accordion(container, "run-1");
    expect(within(oneAfter).getByText("R1 critical")).toBeInTheDocument();
    expect(within(oneAfter).queryByText("R1 warning")).not.toBeInTheDocument();
  });

  it("still syncs ?agent= when no other run owns a severity filter", () => {
    const onTargetChange = vi.fn();
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS, onTargetChange });
    fireEvent.click(within(accordion(container, "run-2")).getByLabelText("Expand this run"));
    expect(onTargetChange).toHaveBeenCalledWith("run-2", null);
  });
});

describe("FindingsTab — has_trace missing means 'assume a trace may exist'", () => {
  it("shows the accordion trace button when has_trace is absent, matching RunHistory", () => {
    const { container } = renderTab({
      runs: [RUNS[0]!],
      // No `has_trace` key at all — the pre-existing-row / unknown case.
      prRuns: [run({ run_id: "run-1" })],
    });
    expect(within(accordion(container, "run-1")).getByLabelText("View agent run trace")).toBeInTheDocument();
  });

  it("still shows it when has_trace is explicitly true", () => {
    const { container } = renderTab({
      runs: [RUNS[0]!],
      prRuns: [run({ run_id: "run-1", has_trace: true })],
    });
    expect(within(accordion(container, "run-1")).getByLabelText("View agent run trace")).toBeInTheDocument();
  });

  it("hides it only when has_trace is explicitly false", () => {
    const { container } = renderTab({
      runs: [RUNS[0]!],
      prRuns: [run({ run_id: "run-1", has_trace: false })],
    });
    expect(
      within(accordion(container, "run-1")).queryByLabelText("View agent run trace"),
    ).not.toBeInTheDocument();
  });
});

describe("FindingsTab — a 'summary'-kind record never suppresses a failed run's row", () => {
  it("still renders the failed row when a summary review shares its run_id", () => {
    renderTab({
      runs: [review({ id: "rv-sum", run_id: "run-x", kind: "summary", agent_name: "Summarizer" })],
      prRuns: [run({ run_id: "run-x", status: "failed", error: "LLM provider returned 503" })],
    });
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("FindingsTab — a run's severity pills keep ?severity= in sync", () => {
  /** The expanded body's pill (full label, e.g. "WARNING") — not the compact
   *  header badge, which renders no severity name. */
  const pill = (el: HTMLElement, sev: string) => within(el).getByText(sev).closest("button")!;

  it("clicking a pill writes ?agent=<run>&severity=<sev>; re-clicking removes severity", () => {
    const onTargetChange = vi.fn();
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS, onTargetChange });
    const one = accordion(container, "run-1"); // default-open
    fireEvent.click(pill(one, "WARNING"));
    expect(onTargetChange).toHaveBeenLastCalledWith("run-1", "WARNING");
    // The panel filtered in place, without a remount.
    expect(within(one).getByText("R1 warning")).toBeInTheDocument();
    expect(within(one).queryByText("R1 critical")).not.toBeInTheDocument();
    fireEvent.click(pill(one, "WARNING"));
    expect(onTargetChange).toHaveBeenLastCalledWith("run-1", null);
    expect(within(one).getByText("R1 critical")).toBeInTheDocument();
  });

  it("a pill-written severity is not wiped by merely expanding another accordion", () => {
    const onTargetChange = vi.fn();
    const { container } = renderTab({ runs: RUNS, prRuns: PR_RUNS, onTargetChange });
    fireEvent.click(pill(accordion(container, "run-1"), "CRITICAL"));
    onTargetChange.mockClear();
    fireEvent.click(within(accordion(container, "run-2")).getByLabelText("Expand this run"));
    expect(onTargetChange).not.toHaveBeenCalled();
  });
});
