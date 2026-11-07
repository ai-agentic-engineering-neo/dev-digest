import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import type { DiffFindingApi } from "../findings";
import type { DiffCommentApi } from "../comments";

afterEach(cleanup);

const FILE = {
  path: "a.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -10,2 +10,3 @@\n first\n+second\n third",
};

function rec(id: string, over: Partial<FindingRecord>): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function api(findings: FindingRecord[], over: Partial<DiffFindingApi> = {}): DiffFindingApi {
  return {
    findings,
    show: true,
    renderCard: (f) => <div>card {f.id}</div>,
    labels: {
      line: { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" },
      outOfPatch: "Out of patch",
      severityCount: (sev, n) => `${sev.toLowerCase()} ${n}`,
      fileDot: (n) => `${n} findings in this file`,
    },
    ...over,
  };
}

const COMMENT: PrReviewComment = {
  id: 1,
  path: "a.ts",
  line: 11,
  original_line: 11,
  side: "RIGHT",
  body: "human remark",
  user: "bob",
  created_at: "2026-01-01T00:00:00Z",
  html_url: "https://example.test/c/1",
  in_reply_to_id: null,
  is_outdated: false,
};

const COMMENTING: DiffCommentApi = {
  comments: [COMMENT],
  canComment: false,
  showComments: true,
  posting: false,
  onSubmit: async () => undefined,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const ACTIVE = [
  rec("c1", { severity: "CRITICAL", start_line: 11 }),
  rec("w1", { severity: "WARNING", start_line: 10 }),
  rec("w2", { severity: "WARNING", start_line: 99 }),
];

describe("FileCard findings", () => {
  it("shows a dot and per-severity counters, and the out-of-patch block", () => {
    const { rerender } = renderCard(
      <FileCard file={FILE} commenting={COMMENTING} findings={api(ACTIVE)} />,
    );
    expect(screen.getByRole("img", { name: "3 findings in this file" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "critical 1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "warning 2" })).toBeInTheDocument();
    // GitHub comment counter stays separate: its own labelled element, showing the
    // comment count (1), not merged into the dot or the severity counters.
    const counter = screen.getByRole("img", { name: "1 comment" });
    expect(counter).toHaveTextContent(/^1$/);
    const dot = screen.getByRole("img", { name: "3 findings in this file" });
    const crit = screen.getByRole("img", { name: "critical 1" });
    const warn = screen.getByRole("img", { name: "warning 2" });
    for (const other of [dot, crit, warn]) {
      expect(counter).not.toBe(other);
      expect(counter).not.toContainElement(other);
      expect(other).not.toContainElement(counter);
    }
    expect(dot).toHaveTextContent("");
    // GitHub comment stays alongside the findings.
    expect(screen.getByText("human remark")).toBeInTheDocument();
    expect(screen.getByText("card c1")).toBeInTheDocument();
    // Line 99 is not in the patch → end-of-file block.
    const title = screen.getByText("Out of patch");
    const card = screen.getByText("card w2");
    expect(title.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <FileCard file={FILE} commenting={COMMENTING} findings={api(ACTIVE, { show: false })} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Out of patch")).not.toBeInTheDocument();
    expect(screen.queryByText("card w2")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 findings in this file" })).toBeInTheDocument();
  });

  it("only dismissed findings → no dot, no counters", () => {
    const dismissed = rec("d1", { severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" });
    renderCard(<FileCard file={FILE} findings={api([dismissed])} />);
    expect(screen.queryByRole("img", { name: /findings in this file/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "critical 1" })).not.toBeInTheDocument();
  });

  it("controlled open hides lines and the header button calls onToggle", () => {
    const onToggle = vi.fn();
    renderCard(<FileCard file={FILE} open={false} onToggle={onToggle} />);
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    const header = screen.getByRole("button", { name: /a\.ts/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("second")).not.toBeInTheDocument();
  });

  it("the header is a keyboard-operable button whose aria-expanded follows the file", () => {
    renderCard(<FileCard file={FILE} />);
    const header = screen.getByRole("button", { name: /a\.ts/ });
    // A native <button> (not a div with onClick): focusable, Enter/Space activate it.
    expect(header.tagName).toBe("BUTTON");
    expect(header).toHaveAttribute("type", "button");
    header.focus();
    expect(header).toHaveFocus();
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("second")).toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("second")).not.toBeInTheDocument();
  });
});
