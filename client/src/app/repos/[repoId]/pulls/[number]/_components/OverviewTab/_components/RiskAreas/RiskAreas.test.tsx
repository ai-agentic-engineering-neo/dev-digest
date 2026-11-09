import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BriefRisk } from "@/lib/types";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const LONG = `${"deep/".repeat(24)}file.ts`;
const RISKS: BriefRisk[] = [
  {
    kind: "security",
    title: "Auth bypass",
    explanation: "<img src=x onerror=alert(1)> **bold**",
    severity: "high",
    file_refs: ["src/a.ts", "lib/b.ts:12-18", "lib/c.ts"],
    refs: [
      { ref: "src/a.ts", path: "src/a.ts", start_line: null, end_line: null, in_diff: true },
      { ref: "lib/b.ts:12-18", path: "lib/b.ts", start_line: 12, end_line: 18, in_diff: false },
      { ref: "lib/c.ts", path: "lib/c.ts", start_line: null, end_line: null, in_diff: false },
    ],
  },
  {
    kind: "weird",
    title: "Slow path",
    explanation: "Might be slow.",
    severity: "medium",
    file_refs: [LONG],
    refs: [{ ref: LONG, path: LONG, start_line: 3, end_line: 3, in_diff: true }],
  },
];

function renderRisks(risks: BriefRisk[], onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} repoFullName="acme/app" linkSha="idx1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("RiskAreas", () => {
  it("shows severity labels, plain-text explanation and routes ref clicks", () => {
    const onOpenFile = renderRisks(RISKS);
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.getByText("Auth bypass")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();

    expect(screen.getByText("<img src=x onerror=alert(1)> **bold**")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts");

    expect(screen.getByRole("link", { name: "Open lib/b.ts:12 on GitHub" })).toHaveAttribute(
      "href",
      githubBlobUrl("acme/app", "idx1", "lib/b.ts", 12),
    );
    expect(screen.getByRole("link", { name: "Open lib/c.ts on GitHub" })).toHaveAttribute(
      "href",
      githubBlobUrl("acme/app", "idx1", "lib/c.ts"),
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("shortens a long path but keeps the full path in title and accessible name", () => {
    renderRisks(RISKS);
    const btn = screen.getByRole("button", { name: `Open ${LONG}:3 in Files changed` });
    expect(btn).toHaveAttribute("title", LONG);
    expect(btn.textContent?.length).toBeLessThan(LONG.length);
  });

  it("shows the empty message", () => {
    renderRisks([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
