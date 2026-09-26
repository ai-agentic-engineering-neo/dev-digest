/**
 * DiffViewer — finding markers (Smart Order, L03): line labels ("blocker" /
 * "warning" / "suggestion", +N), the inline card OPEN BY DEFAULT under a line
 * with an active finding (collapsed when all findings on the line are
 * dismissed), accept/dismiss via the `DiffFindingApi.Card` slot, the
 * unanchored-findings block, muted dismissed-only lines, and the file dot.
 * `Card` is a tiny stub — the real `InlineFindingCard` has its own test —
 * rendering `f.title`, an Accept button, and a Close button when `onClose`
 * is passed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingActionKind, FindingRecord, PrFile } from "@devdigest/shared";
import type { DiffFindingApi, InlineFindingCardProps } from "../findings";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

function Card({ f, onAction, onClose }: InlineFindingCardProps) {
  return (
    <div>
      <span>{f.title}</span>
      <button type="button" onClick={() => onAction?.("accept")}>
        Accept {f.id}
      </button>
      {onClose && (
        <button type="button" onClick={onClose}>
          Close {f.id}
        </button>
      )}
    </div>
  );
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "security",
    title: `Finding ${o.id}`,
    file: "src/config.ts",
    start_line: 1,
    end_line: 1,
    rationale: "rationale",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function findingApiFor(
  byFile: Record<string, FindingRecord[]>,
  onAction: (id: string, a: FindingActionKind) => void = () => {},
): DiffFindingApi {
  return {
    byFile: new Map(Object.entries(byFile)),
    Card,
    pending: false,
    onAction,
  };
}

const THREE_LINE_PATCH = "@@ -1,0 +1,3 @@\n+line one\n+line two\n+line three";

function renderViewer(files: PrFile[], findings?: DiffFindingApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      <div data-theme="dark">
        <DiffViewer files={files} findings={findings} />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("DiffViewer — finding markers", () => {
  it("shows a line label per severity: blocker / warning / suggestion", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [
        finding({ id: "f1", severity: "CRITICAL", start_line: 1 }),
        finding({ id: "f2", severity: "WARNING", start_line: 2 }),
        finding({ id: "f3", severity: "SUGGESTION", start_line: 3 }),
      ],
    });
    renderViewer([file], findings);
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("suggestion")).toBeInTheDocument();
  });

  it("the inline card for an active finding is open by default; clicking the badge collapses it, clicking again reopens it", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [finding({ id: "f1", severity: "CRITICAL", start_line: 1, title: "Hardcoded secret" })],
    });
    renderViewer([file], findings);

    const label = screen.getByText("blocker");
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("a line whose findings are ALL dismissed starts collapsed; clicking the badge opens it", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [
        finding({
          id: "f1",
          severity: "CRITICAL",
          start_line: 1,
          title: "Old, dismissed finding",
          dismissed_at: "2026-09-01T00:00:00Z",
        }),
      ],
    });
    renderViewer([file], findings);

    const label = screen.getByText("blocker");
    expect(label).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Old, dismissed finding")).not.toBeInTheDocument();

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Old, dismissed finding")).toBeInTheDocument();
  });

  it("Accept in the inline card calls findings.onAction with (finding.id, \"accept\") without clicking the badge first", () => {
    const onAction = vi.fn();
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor(
      { "src/config.ts": [finding({ id: "f1", severity: "CRITICAL", start_line: 1 })] },
      onAction,
    );
    renderViewer([file], findings);

    fireEvent.click(screen.getByText("Accept f1"));

    expect(onAction).toHaveBeenCalledWith("f1", "accept");
  });

  it("the slotted card's onClose collapses it back under the badge", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [finding({ id: "f1", severity: "CRITICAL", start_line: 1, title: "Hardcoded secret" })],
    });
    renderViewer([file], findings);

    const label = screen.getByText("blocker");
    expect(label).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByText("Close f1"));

    expect(label).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("a finding on a line outside the rendered patch shows in the unanchored block, with no line label", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [finding({ id: "f1", severity: "WARNING", start_line: 99, title: "Out of hunk" })],
    });
    renderViewer([file], findings);

    expect(screen.getByText("1 finding(s) not on a line shown in this diff")).toBeInTheDocument();
    expect(screen.getByText("Out of hunk")).toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });

  it("patch: null with one finding shows the no-diff text and the unanchored block", () => {
    const file: PrFile = { path: "src/deleted.ts", additions: 0, deletions: 0, patch: null };
    const findings = findingApiFor({
      "src/deleted.ts": [finding({ id: "f1", severity: "CRITICAL", file: "src/deleted.ts", start_line: 1 })],
    });
    renderViewer([file], findings);

    expect(screen.getByText("No diff text available (binary or unfetched patch).")).toBeInTheDocument();
    expect(screen.getByText("1 finding(s) not on a line shown in this diff")).toBeInTheDocument();
  });

  it("showComments=false still shows the finding label on the line", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const findings = findingApiFor({
      "src/config.ts": [finding({ id: "f1", severity: "CRITICAL", start_line: 1 })],
    });
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
        <div data-theme="dark">
          <DiffViewer
            files={[file]}
            findings={findings}
            commenting={{ comments: [], canComment: false, showComments: false, posting: false, onSubmit: async () => ({}) }}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("the file dot shows the highest ACTIVE severity; when only dismissed, the dot is gone but the line label remains", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    const active = findingApiFor({
      "src/config.ts": [finding({ id: "f1", severity: "CRITICAL", start_line: 1 })],
    });
    const { unmount } = renderViewer([file], active);
    expect(screen.getByLabelText("Highest finding severity: CRITICAL")).toBeInTheDocument();
    unmount();

    const dismissedOnly = findingApiFor({
      "src/config.ts": [
        finding({ id: "f1", severity: "CRITICAL", start_line: 1, dismissed_at: "2026-09-01T00:00:00Z" }),
      ],
    });
    renderViewer([file], dismissedOnly);
    expect(screen.queryByLabelText("Highest finding severity: CRITICAL")).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("a large file (+300) with one active finding auto-expands and renders its lines; the same file with only a dismissed finding stays collapsed", () => {
    const bigPatch = "@@ -1,0 +1,3 @@\n+line one\n+line two\n+line three";
    const file: PrFile = { path: "src/big.ts", additions: 300, deletions: 0, patch: bigPatch };
    const active = findingApiFor({
      "src/big.ts": [finding({ id: "f1", severity: "CRITICAL", file: "src/big.ts", start_line: 1 })],
    });
    const { unmount } = renderViewer([file], active);
    expect(screen.getByText("line one")).toBeInTheDocument();
    unmount();

    const dismissedOnly = findingApiFor({
      "src/big.ts": [
        finding({
          id: "f1",
          severity: "CRITICAL",
          file: "src/big.ts",
          start_line: 1,
          dismissed_at: "2026-09-01T00:00:00Z",
        }),
      ],
    });
    renderViewer([file], dismissedOnly);
    expect(screen.queryByText("line one")).not.toBeInTheDocument();
  });

  it("renders without findings (smoke, matches the existing smoke test's usage)", () => {
    const file: PrFile = { path: "src/config.ts", additions: 3, deletions: 0, patch: THREE_LINE_PATCH };
    expect(() => renderViewer([file])).not.toThrow();
  });
});
