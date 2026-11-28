import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ isPending: false }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: state.isPending }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  state.isPending = false;
});

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

/** A run with 1 CRITICAL, 2 WARNING (one low-confidence) and no SUGGESTION. */
function finding(id: string, severity: FindingRecord["severity"], confidence: number): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title: `${severity} ${id}`, confidence };
}
const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL", 0.95),
  finding("w1", "WARNING", 0.9),
  finding("w2", "WARNING", 0.4),
];

describe("FindingsPanel severity filter", () => {
  it("shows a counter per level that matches the cards in the list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 WARNING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 SUGGESTION" })).toBeInTheDocument();
    expect(screen.getAllByText(/^CRITICAL /)).toHaveLength(1);
    expect(screen.getAllByText(/^WARNING /)).toHaveLength(2);
  });

  it("leaves only the clicked level, and restores the full list on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    expect(screen.queryByText("CRITICAL c1")).not.toBeInTheDocument();
    expect(screen.getByText("WARNING w1")).toBeInTheDocument();
    expect(screen.getByText("WARNING w2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    expect(screen.getByText("CRITICAL c1")).toBeInTheDocument();
    expect(screen.getByText("WARNING w1")).toBeInTheDocument();
  });

  it("combines with hide-low-confidence: counters and list keep only findings that pass both", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("button", { name: "1 WARNING" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("WARNING w1")).toBeInTheDocument();
    expect(screen.queryByText("WARNING w2")).not.toBeInTheDocument();
    expect(screen.queryByText("CRITICAL c1")).not.toBeInTheDocument();
  });

  it("shows the empty state when the filters leave nothing", () => {
    const onlyLow = [finding("w2", "WARNING", 0.4)];
    renderWithIntl(<FindingsPanel findings={onlyLow} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "1 WARNING" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 WARNING" })).toBeEnabled();
  });
});

describe("FindingsPanel shortcuts", () => {
  it("accepts the focused finding on a plain `a`", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ findingId: "c1", action: "accept", prId: "pr1" });
  });

  it("ignores Cmd/Ctrl/Alt chords, key repeat and an open dialog", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a", metaKey: true });
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.keyDown(window, { key: "d", altKey: true });
    fireEvent.keyDown(window, { key: "a", repeat: true });
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    fireEvent.keyDown(window, { key: "a" });
    dialog.remove();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("ignores keys typed into a text field", () => {
    renderWithIntl(
      <>
        <input aria-label="note" />
        <FindingsPanel findings={MIXED} prId="pr1" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "a" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("with two panels mounted, one `a` press triggers one mutation, from the panel last touched", () => {
    renderWithIntl(
      <>
        <FindingsPanel findings={[finding("x1", "WARNING", 0.9)]} prId="pr1" />
        <FindingsPanel findings={[finding("y1", "WARNING", 0.9)]} prId="pr1" />
      </>,
    );
    fireEvent.pointerDown(screen.getByText("WARNING y1"));
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ findingId: "y1", action: "accept", prId: "pr1" });
  });

  it("hands the claim to the surviving panel when the active one unmounts", () => {
    const first = <FindingsPanel key="a" findings={[finding("x1", "WARNING", 0.9)]} prId="pr1" />;
    const second = <FindingsPanel key="b" findings={[finding("y1", "WARNING", 0.9)]} prId="pr1" />;
    const { rerender } = renderWithIntl(<>{first}{second}</>);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {second}
      </NextIntlClientProvider>,
    );
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ findingId: "y1", action: "accept", prId: "pr1" });
  });

  it("does not accept on the second key of a `g` nav chord", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("does nothing on `a` while an action is pending", () => {
    state.isPending = true;
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).not.toHaveBeenCalled();
  });
});
