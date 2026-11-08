import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import type { ProjectContextTrace } from "@/lib/types";
import { ProjectContextBlock } from "./ProjectContextBlock";

afterEach(cleanup);

function renderBlock(block: ProjectContextTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ProjectContextBlock block={block} />
    </NextIntlClientProvider>,
  );
}

const OK: ProjectContextTrace = {
  status: "ok",
  cap_tokens: 4000,
  total_tokens: 1820,
  included: [
    { path: "docs/a.md", tokens: 820 },
    { path: "specs/b.md", tokens: 1000 },
  ],
  left_out: [
    { path: "specs/huge.md", tokens: 5100, reason: "too_large" },
    { path: "docs/late.md", tokens: 3000, reason: "over_cap" },
    { path: "docs/gone.md", tokens: null, reason: "missing" },
  ],
  changed_by_pr: ["docs/a.md"],
};

describe("ProjectContextBlock (AC-9, AC-10)", () => {
  it("shows the summary, included docs with tokens, and left-out docs with their reasons", () => {
    renderBlock(OK);
    expect(screen.getByText("2 included · ~1820 of 4000 tokens")).toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("~820 tokens")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();

    expect(screen.getByText("specs/huge.md")).toBeInTheDocument();
    expect(screen.getByText("too large")).toBeInTheDocument();
    expect(screen.getByText("docs/late.md")).toBeInTheDocument();
    expect(screen.getByText("over cap")).toBeInTheDocument();
    expect(screen.getByText("docs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("notes attached docs that the PR changes", () => {
    renderBlock(OK);
    expect(
      screen.getByText("this PR changes docs/a.md; the agent saw the synced version"),
    ).toBeInTheDocument();
  });

  it("shows 'none' when nothing was included and hides the left-out list when empty", () => {
    renderBlock({ ...OK, included: [], total_tokens: 0, left_out: [], changed_by_pr: [] });
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.queryByText("Left out")).not.toBeInTheDocument();
    expect(screen.queryByText(/this PR changes/)).not.toBeInTheDocument();
  });

  it("renders the unavailable state with the attached paths", () => {
    renderBlock({ status: "unavailable", reason: "repo_not_synced", attached: ["docs/a.md"] });
    expect(screen.getByText("project context unavailable: repo not synced")).toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
  });

  it("renders a doc path as text, never as markup", () => {
    const path = "docs/<img src=x onerror=alert(1)>.md";
    const { container } = renderBlock({ ...OK, included: [{ path, tokens: 1 }], left_out: [], changed_by_pr: [] });
    expect(screen.getByText(path)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
