import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Onboarding } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { TourSections } from "./TourSections";

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div data-testid="diagram">{chart}</div>,
}));

afterEach(cleanup);

const tour = (over: Partial<{ diagram: string | null; commands: Onboarding["sections"][2]["items"] }> = {}): Onboarding => ({
  generated_at: "2026-10-21T10:00:00.000Z",
  provider: "openrouter",
  model: "m",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: null,
  files_indexed: 10,
  limited: false,
  sections: [
    { kind: "architecture", title: "A", body: "Entry is `src/server.ts`.\n\n```\nnpm run x\n```", diagram: over.diagram === undefined ? "flowchart LR\n A-->B" : over.diagram },
    { kind: "critical_paths", title: "C", items: [{ path: "src/server.ts", why: "bootstrap" }] },
    { kind: "run_locally", title: "R", items: over.commands ?? [{ command: "pnpm dev", note: null }] },
    { kind: "reading_path", title: "G", items: [{ path: "src/a.ts", why: "first" }, { path: "src/b.ts", why: "second" }] },
    { kind: "first_tasks", title: "F", items: [{ title: "Add a log line", why: "easy", files: [{ path: "src/server.ts" }] }] },
  ],
});

const renderSections = (t: Onboarding) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourSections tour={t} repo={{ full_name: "acme/api", default_branch: "main" }} />
    </NextIntlClientProvider>,
  );

describe("TourSections", () => {
  it("renders the five cards in order with their content, numbered reading steps from 1 (AC-8, 13, 15, 16, 18, 19)", () => {
    renderSections(tour());
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(screen.getByTestId("diagram")).toHaveTextContent("flowchart LR");
    expect(screen.getByText("src/server.ts", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy command: pnpm dev" })).toBeInTheDocument();
    const reading = document.getElementById("reading-path")!;
    expect(within(reading).getByText("1")).toBeInTheDocument();
    expect(within(reading).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Add a log line" })).toBeInTheDocument();
    // fenced block is a block, not an inline chip
    expect(document.querySelector("pre")).toHaveTextContent("npm run x");
  });

  it("a null diagram renders the body alone; an empty list shows the section's note (AC-14, AC-30)", () => {
    renderSections(tour({ diagram: null, commands: [] }));
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.getByText("No run commands could be verified against the repository files.")).toBeInTheDocument();
  });
});
