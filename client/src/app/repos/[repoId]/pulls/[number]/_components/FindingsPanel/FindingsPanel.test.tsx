import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, within, waitFor, act } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsPanel } from "./FindingsPanel";

// Finding actions hit the real useFindingAction → fetch; the stub records them.
let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  api = mockFetch({
    "POST /findings/:id/:action": (req) => ({ finding: { id: req.params.id } }),
    "GET /pulls/:id/reviews": [],
  });
});
afterEach(cleanup);

/** The finding-action requests sent so far, as "<id>/<action>". */
const actionsSent = () =>
  api.requests("POST").map((r) => r.path.replace(/^\/findings\//, ""));
/** Let a keypress that should be ignored settle before asserting nothing was sent. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

const mk = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
  ...FINDINGS[0]!,
  id,
  severity,
  confidence,
  title: `${severity} ${id}`,
});

// 3 CRITICAL (one low-confidence) · 2 WARNING · 1 SUGGESTION, deliberately unsorted.
const MIXED: FindingRecord[] = [
  mk("s1", "SUGGESTION"),
  mk("c1", "CRITICAL"),
  mk("w1", "WARNING"),
  mk("c2", "CRITICAL"),
  mk("w2", "WARNING"),
  mk("c3", "CRITICAL", 0.3),
];

const cardTitles = () => screen.queryAllByText(/^(CRITICAL|WARNING|SUGGESTION) [a-z]\d$/).map((n) => n.textContent);
const counters = () => screen.getByRole("group", { name: "Findings by severity" });

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithProviders(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithProviders(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("shows a counter per present severity, number first", () => {
    renderWithProviders(<FindingsPanel findings={MIXED} prId="pr1" />);
    const row = counters();
    expect(within(row).getByRole("button", { name: "3 critical" })).toHaveTextContent("3CRITICAL");
    expect(within(row).getByRole("button", { name: "2 warning" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "1 suggestion" })).toBeInTheDocument();
  });

  it("hides the pill of a severity with no findings, and the whole row with no findings", () => {
    const { unmount } = renderWithProviders(<FindingsPanel findings={[mk("w1", "WARNING")]} prId="pr1" />);
    expect(within(counters()).getAllByRole("button")).toHaveLength(1);
    unmount();
    renderWithProviders(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).toBeNull();
  });

  it("filter button keeps only that level; a second click restores the full list", async () => {
    const { user } = renderWithProviders(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(cardTitles()).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: "Warning" }));
    expect(cardTitles()).toEqual(["WARNING w1", "WARNING w2"]);

    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toEqual(["CRITICAL c1", "CRITICAL c2", "CRITICAL c3"]);

    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toHaveLength(6);
  });

  it("clicking a counter pill filters like the matching button", async () => {
    const { user } = renderWithProviders(<FindingsPanel findings={MIXED} prId="pr1" />);
    const pill = within(counters()).getByRole("button", { name: "1 suggestion" });
    await user.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles()).toEqual(["SUGGESTION s1"]);
    await user.click(pill);
    expect(cardTitles()).toHaveLength(6);
  });

  it("counts follow 'hide low confidence' so a pill equals the cards shown", async () => {
    const { user } = renderWithProviders(<FindingsPanel findings={MIXED} prId="pr1" />);
    await user.click(screen.getByRole("switch"));
    expect(within(counters()).getByRole("button", { name: "2 critical" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toHaveLength(2);
  });
});

describe("FindingsPanel finding actions", () => {
  it("Accept / Dismiss on a card send the action for that finding", async () => {
    const { user } = renderWithProviders(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    await user.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(actionsSent()).toEqual(["f1/accept"]));
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(actionsSent()).toEqual(["f1/accept", "f1/dismiss"]));
  });
});

describe("FindingsPanel keyboard shortcuts", () => {
  it("only the active panel handles a/d when several panels are mounted", async () => {
    const { user } = renderWithProviders(
      <>
        <FindingsPanel findings={[mk("c1", "CRITICAL")]} prId="pr1" active />
        <FindingsPanel findings={[mk("w1", "WARNING")]} prId="pr1" active={false} />
      </>,
    );
    await user.keyboard("a");
    await waitFor(() => expect(actionsSent()).toEqual(["c1/accept"]));
    await settle();
    expect(actionsSent()).toEqual(["c1/accept"]);
  });

  it("interacting with an inactive panel asks the parent to make it active", async () => {
    const onActivate = vi.fn();
    const { user } = renderWithProviders(
      <FindingsPanel findings={[mk("w1", "WARNING")]} prId="pr1" active={false} onActivate={onActivate} />,
    );
    await user.click(screen.getByText("WARNING w1"));
    expect(onActivate).toHaveBeenCalled();
    await user.keyboard("d");
    await settle();
    expect(actionsSent()).toEqual([]);
  });

  it("ignores shortcuts typed into an input", async () => {
    const { user } = renderWithProviders(
      <>
        <input aria-label="search" />
        <FindingsPanel findings={[mk("c1", "CRITICAL")]} prId="pr1" />
      </>,
    );
    await user.type(screen.getByRole("textbox", { name: "search" }), "a");
    await settle();
    expect(actionsSent()).toEqual([]);
  });

  it("keeps the focus on a real card when the filtered list shrinks", async () => {
    const { user } = renderWithProviders(<FindingsPanel findings={MIXED} prId="pr1" />);
    await user.keyboard("jjjjj"); // focus the last of 6 cards
    await user.click(screen.getByRole("switch")); // hide low confidence → 5 cards
    await user.keyboard("d");
    const last = cardTitles().at(-1)!.split(" ")[1];
    await waitFor(() => expect(actionsSent()).toEqual([`${last}/dismiss`]));
  });
});
