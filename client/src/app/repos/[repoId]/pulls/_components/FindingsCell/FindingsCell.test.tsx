/**
 * FindingsCell — the popover's close-on-scroll must ignore scrolling of its
 * OWN content (WP2 / frontend-react-1-1): only a scroll outside the panel
 * (the page / a scroll container) closes it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindingsRollup } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

const ROLLUP: PrFindingsRollup = {
  total: 2,
  by_severity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
  preview: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
      file: "src/config.ts",
      start_line: 3,
      end_line: 3,
      confidence: 0.9,
      description: "A live secret is committed.",
    },
    {
      id: "f2",
      severity: "WARNING",
      category: "bug",
      title: "Missing null check",
      file: "src/index.ts",
      start_line: 10,
      end_line: 10,
      confidence: 0.7,
      description: "Could throw on null input.",
    },
  ],
};

function renderCell() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      <FindingsCell rollup={ROLLUP} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsCell — popover close-on-scroll", () => {
  it("stays open when the panel itself is scrolled, and closes when the page is", () => {
    renderCell();
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.scroll(screen.getByRole("tooltip"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
