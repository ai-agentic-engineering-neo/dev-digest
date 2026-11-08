import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runsMessages from "../../../../../messages/en/runs.json";
import type { SpecsReadView } from "../../helpers";
import { SpecsRead } from "./SpecsRead";

function renderView(view: SpecsReadView) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
      <SpecsRead view={view} />
    </NextIntlClientProvider>,
  );
}

describe("SpecsRead (SPEC-04 AC-6)", () => {
  it("lists included docs, then left-out docs (muted) with their reason chip", () => {
    const { container } = renderView({
      kind: "detail",
      included: [{ path: "docs/rate-limiting.md", changed: false }],
      leftOut: [{ path: "specs/security-baseline.md", reason: "too_large", changed: false }],
      unavailable: [],
    });
    const text = container.textContent ?? "";
    expect(text.indexOf("docs/rate-limiting.md")).toBeLessThan(text.indexOf("specs/security-baseline.md"));
    expect(screen.getByText("specs/security-baseline.md")).toHaveStyle({ color: "var(--text-muted)" });
    expect(screen.getByText("too large")).toBeInTheDocument();
  });

  it("marks a doc the PR changes, with an explaining title", () => {
    renderView({ kind: "detail", included: [{ path: "docs/a.md", changed: true }], leftOut: [], unavailable: [] });
    const marker = screen.getByText("changed by this PR");
    expect(marker).toHaveAttribute("title", "this PR changes docs/a.md; the agent saw the synced version");
    expect(marker).toHaveAccessibleName("this PR changes docs/a.md; the agent saw the synced version");
  });

  it("shows the unavailable repo docs after the included ones, and no note when empty (SPEC-03 AC-11)", () => {
    const { container, unmount } = renderView({
      kind: "detail",
      included: [{ path: ".devdigest/specs/x.md", changed: false }],
      leftOut: [],
      unavailable: ["docs/a.md"],
    });
    const text = container.textContent ?? "";
    expect(text.indexOf(".devdigest/specs/x.md")).toBeLessThan(text.indexOf("project context unavailable"));
    expect(screen.getByText("project context unavailable: repo not synced")).toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    unmount();
    renderView({
      kind: "detail",
      included: [{ path: ".devdigest/specs/x.md", changed: false }],
      leftOut: [],
      unavailable: [],
    });
    expect(screen.queryByText("project context unavailable: repo not synced")).not.toBeInTheDocument();
  });

  it("shows the unavailable note with the attached paths", () => {
    renderView({ kind: "unavailable", attached: ["docs/a.md"] });
    expect(screen.getByText("project context unavailable: repo not synced")).toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
  });

  it("shows legacy paths and 'none'", () => {
    renderView({ kind: "paths", paths: ["docs/old.md"] });
    expect(screen.getByText("docs/old.md")).toBeInTheDocument();
  });

  it("shows 'none' when nothing is recorded", () => {
    renderView({ kind: "none" });
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("renders a doc path as plain text, never markup", () => {
    const { container } = renderView({ kind: "paths", paths: ["<img src=x>.md"] });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x>.md")).toBeInTheDocument();
  });
});
