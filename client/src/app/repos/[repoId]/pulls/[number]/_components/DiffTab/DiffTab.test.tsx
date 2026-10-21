import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

const PATCH = "@@ -1,1 +1,3 @@\n x\n+y\n+z";
// pr.files order is GitHub order: tests file first, then core, then docs.
const FILES: PrFile[] = [
  { path: "test/a.test.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "src/a.ts", additions: 2, deletions: 0, patch: PATCH },
  { path: "docs/a.md", additions: 1, deletions: 0, patch: PATCH },
];

const sf = (path: string, lines: number[] = [], ids: string[] = []) => ({
  path,
  additions: 1,
  deletions: 0,
  finding_lines: lines,
  finding_ids: ids,
});
const SMART: SmartDiffResponse = {
  has_review: true,
  groups: [
    { role: "core", files: [sf("src/a.ts", [2], ["f1"])] },
    { role: "tests", files: [sf("test/a.test.ts")] },
    { role: "wiring", files: [] },
    { role: "docs", files: [sf("docs/a.md")] },
    { role: "boilerplate", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};
const REVIEWS = [
  {
    id: "r1",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded key here",
        file: "src/a.ts",
        start_line: 2,
        end_line: 2,
        rationale: "Plaintext secret rationale.",
        suggestion: null,
        confidence: 0.9,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
] as unknown as ReviewRecord[];

let reviewsBody: unknown = REVIEWS;
let smartStatus = 200;
const fetchMock = vi.fn();
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={3} files={FILES} canComment />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  reviewsBody = REVIEWS;
  smartStatus = 200;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return json({ finding: REVIEWS[0]!.findings[0] });
    if (url.includes("/smart-diff"))
      return smartStatus === 200
        ? json(SMART)
        : Promise.resolve(
            new Response(JSON.stringify({ error: { message: "boom" } }), {
              status: smartStatus,
              headers: { "content-type": "application/json" },
            }),
          );
    if (url.includes("/reviews")) return json(reviewsBody);
    if (url.includes("/comments")) return json([]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pathsInOrder = () =>
  screen.getAllByText(/^(src|test|docs)\/a(\.test)?\.(ts|md)$/).map((el) => el.textContent);

describe("DiffTab smart diff", () => {
  it("renders non-empty role groups in server order with labels and counts", async () => {
    renderTab();
    await screen.findByText("Core logic");
    const labels = ["Core logic", "Tests", "Docs"].map((l) => screen.getByText(l));
    expect(labels).toHaveLength(3);
    expect(screen.queryByText("Wiring")).toBeNull();
    expect(
      labels[0]!.compareDocumentPosition(labels[1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText("1 files").length).toBeGreaterThan(0);
    expect(screen.getByText("The substance of the change — review closely")).toBeTruthy();
  });

  it("shows the dot, the inline finding and the severity pill on the anchored line", async () => {
    renderTab();
    expect(await screen.findByText("Hardcoded key here")).toBeTruthy();
    expect(screen.getByText("Plaintext secret rationale.")).toBeTruthy();
    expect(screen.getByLabelText("Has findings")).toBeTruthy();
    expect(screen.getByText("critical")).toBeTruthy();
  });

  it("hides findings and pills with the comments toggle but keeps the dot", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Hardcoded key here");
    await user.click(screen.getByRole("button", { name: /Hide comments/ }));
    expect(screen.queryByText("Hardcoded key here")).toBeNull();
    expect(screen.queryByText("critical")).toBeNull();
    expect(screen.getByLabelText("Has findings")).toBeTruthy();
  });

  it("Original order lists files in pr.files order", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Core logic");
    await user.click(screen.getByRole("button", { name: "Original order" }));
    await waitFor(() => expect(screen.queryByText("Core logic")).toBeNull());
    expect(pathsInOrder()).toEqual(["test/a.test.ts", "src/a.ts", "docs/a.md"]);
    expect(screen.getByText("Hardcoded key here")).toBeTruthy();
  });

  it("Accept posts to /findings/:id/accept", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Hardcoded key here");
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes("/findings/f1/accept") && (i as RequestInit)?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  // Regression: a finding whose line is not in the patch must not vanish (AC13)
  // and must still obey the shared comments toggle (AC14).
  it("renders a finding outside the patch in the 'Findings outside the diff' block, hidden by the toggle", async () => {
    const user = userEvent.setup();
    const base = (REVIEWS as unknown as { findings: Record<string, unknown>[] }[])[0]!.findings[0]!;
    reviewsBody = [
      { id: "r1", findings: [{ ...base, start_line: 99, end_line: 99, title: "Stale line finding" }] },
    ];
    renderTab();
    expect(await screen.findByText("Findings outside the diff")).toBeTruthy();
    expect(screen.getByText("Stale line finding")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Hide comments/ }));
    expect(screen.queryByText("Stale line finding")).toBeNull();
    expect(screen.queryByText("Findings outside the diff")).toBeNull();
  });

  // Regression: a failing smart-diff request must not leave the tab blank.
  it("falls back to Original order rendering when smart-diff fails", async () => {
    smartStatus = 500;
    renderTab();
    await waitFor(() => expect(pathsInOrder()).toEqual(["test/a.test.ts", "src/a.ts", "docs/a.md"]));
    expect(screen.queryByText("Core logic")).toBeNull();
  });
});
