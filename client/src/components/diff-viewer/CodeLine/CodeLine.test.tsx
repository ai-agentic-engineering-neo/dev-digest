import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { CodeLine } from "./CodeLine";
import type { DiffFindingApi } from "../findings";
import type { DiffCommentApi } from "../comments";

afterEach(cleanup);

function rec(id: string, over: Partial<FindingRecord>): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 12,
    end_line: 12,
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

const CRIT = rec("f1", { severity: "CRITICAL" });
const WARN = rec("f2", { severity: "WARNING" });
const LINE = { kind: "add", text: "const x = 1;", newNo: 12 } as const;

function api(over: Partial<DiffFindingApi> = {}): DiffFindingApi {
  return {
    findings: [],
    show: true,
    renderCard: (f) => <div>card {f.id}</div>,
    labels: {
      line: { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" },
      outOfPatch: "Out of patch",
      severityCount: (sev, n) => `${n} ${sev}`,
      fileDot: (n) => `${n} findings`,
    },
    ...over,
  };
}

describe("CodeLine findings", () => {
  it("flagged line shows right-end icons and cards, hides cards when show is false", () => {
    const { rerender } = render(
      <CodeLine ln={LINE} path="a.ts" threads={[]} findings={[CRIT, WARN]} findingApi={api()} />,
    );
    const blocker = screen.getByRole("img", { name: "blocker" });
    const warning = screen.getByRole("img", { name: "warning" });
    const text = screen.getByText("const x = 1;");
    expect(blocker.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.compareDocumentPosition(blocker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("card f1")).toBeInTheDocument();
    expect(screen.getByText("card f2")).toBeInTheDocument();

    rerender(
      <CodeLine ln={LINE} path="a.ts" threads={[]} findings={[CRIT, WARN]} findingApi={api({ show: false })} />,
    );
    expect(screen.queryByText("card f1")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "blocker" })).toBeInTheDocument();
  });

  it("dismissed finding has no icon but keeps its card", () => {
    const dismissed = rec("f1", { severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" });
    render(<CodeLine ln={LINE} path="a.ts" threads={[]} findings={[dismissed]} findingApi={api()} />);
    expect(screen.queryByRole("img", { name: "blocker" })).not.toBeInTheDocument();
    expect(screen.getByText("card f1")).toBeInTheDocument();
  });

  it("composer still opens while comment threads are hidden", () => {
    const commenting: DiffCommentApi = {
      comments: [],
      canComment: true,
      showComments: false,
      posting: false,
      onSubmit: async () => undefined,
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <CodeLine ln={LINE} path="a.ts" threads={[]} commenting={commenting} findings={[CRIT]} findingApi={api()} />
      </NextIntlClientProvider>,
    );
    fireEvent.mouseEnter(screen.getByText("const x = 1;"));
    fireEvent.click(screen.getByRole("button", { name: "Add a comment on this line" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
