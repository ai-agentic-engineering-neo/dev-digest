import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare } from "@devdigest/shared/contracts/eval-ci";
import messages from "../../../../../../../messages/en/eval.json";

let COMPARE: EvalCompare | undefined;
let IS_ERROR = false;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalCompare: () => ({ data: COMPARE, isLoading: false, isError: IS_ERROR }),
}));

import { CompareModal } from "./CompareModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  COMPARE = undefined;
  IS_ERROR = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function runRecord(overrides: Partial<EvalCompare["old"]> = {}): EvalCompare["old"] {
  return {
    id: "run-old",
    owner_kind: "agent",
    owner_id: "agent-1",
    agent_name: "Security Reviewer",
    status: "completed",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    agent_version: 1,
    case_ids: ["c1"],
    metrics: null,
    duration_ms: 1000,
    cost_usd: 0.01,
    error_reason: null,
    ...overrides,
  };
}

describe("CompareModal — AC-32 … AC-34, AC-55", () => {
  it("renders metric deltas, the case-set difference, and distinguishes added/removed prompt-diff lines, and closes on request", () => {
    const onClose = vi.fn();
    COMPARE = {
      old: runRecord({ id: "run-old", agent_version: 1 }),
      new: runRecord({ id: "run-new", agent_version: 2, case_ids: ["c1", "c2"] }),
      common_case_ids: ["c1"],
      only_in_old: [],
      only_in_new: ["c2"],
      deltas: { recall: 0.1, precision: -0.05, citation_accuracy: null },
      prompt_diff: [
        { kind: "context", text: "You are a reviewer." },
        { kind: "removed", text: "Be lenient." },
        { kind: "added", text: "Be strict." },
      ],
    };

    renderWithIntl(<CompareModal a="run-old" b="run-new" onClose={onClose} />);

    // The modal itself, with its title.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Compare runs")).toBeInTheDocument();

    // AC-33 — metric deltas, one of which is not applicable.
    expect(screen.getByText("+10.0pp")).toBeInTheDocument();
    expect(screen.getByText("-5.0pp")).toBeInTheDocument();
    expect(screen.getByText("n/a")).toBeInTheDocument();

    // AC-33 — the case-set difference is named, not silently dropped.
    expect(screen.getByText(/1 case\(s\) only in the newer run/)).toBeInTheDocument();
    expect(screen.getByText(/computed over the 1 case\(s\) common to both/)).toBeInTheDocument();

    // AC-34/AC-55 — added and removed prompt lines carry a distinguishing
    // glyph, not colour alone; a context line carries neither.
    expect(screen.getByText("+ Be strict.")).toBeInTheDocument();
    expect(screen.getByText("- Be lenient.")).toBeInTheDocument();
    expect(screen.getByText("You are a reviewer.")).toBeInTheDocument();

    // Two "Close" controls exist (the modal's header X icon and the footer
    // button) — both share the accessible name "Close"; the footer one is
    // the explicit user-facing action, and is last in DOM order.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the select-two-runs message when the compare request errors", () => {
    IS_ERROR = true;
    renderWithIntl(<CompareModal a="run-old" b="run-new" onClose={vi.fn()} />);
    expect(screen.getByText("Select two runs to compare.")).toBeInTheDocument();
  });
});
