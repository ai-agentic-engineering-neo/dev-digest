import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../../../messages/en/brief.json";
import type { BriefMissingInput, BriefTruncation } from "@/lib/types";
import { BriefNotes } from "./BriefNotes";

const NO_TRUNCATION: BriefTruncation = { spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 };

function renderIt(missing: BriefMissingInput[], truncated: BriefTruncation) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BriefNotes missing={missing} truncated={truncated} />
    </NextIntlClientProvider>,
  );
}

describe("BriefNotes", () => {
  afterEach(cleanup);

  it("shows missing inputs in a warning box and the truncated line muted outside it", () => {
    renderIt([{ input: "intent", reason: "not_derived" }], { ...NO_TRUNCATION, callers: 2 });

    const box = screen.getByText("Missing inputs").closest("div")?.parentElement;
    expect(box).toHaveStyle({ border: "1px solid var(--warn)", background: "var(--warn-bg)" });
    expect(box).toHaveTextContent("Intent unavailable");

    const truncated = screen.getByText(/^Truncated:/);
    expect(truncated).toHaveStyle({ color: "var(--text-muted)" });
    expect(box).not.toContainElement(truncated);
  });

  it("renders nothing when there is nothing to report", () => {
    const { container } = renderIt([], NO_TRUNCATION);
    expect(container).toBeEmptyDOMElement();
  });
});
