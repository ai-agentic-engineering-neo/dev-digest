import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { FindingsHover } from "./FindingsHover";
import { countsFromMap, lineRef, plainText } from "./helpers";

afterEach(cleanup);

const renderHover = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("findings-hover helpers", () => {
  it("countsFromMap drops zero severities and keeps display order", () => {
    expect(countsFromMap({ SUGGESTION: 2, CRITICAL: 1, WARNING: 0 })).toEqual([
      { severity: "CRITICAL", count: 1 },
      { severity: "SUGGESTION", count: 2 },
    ]);
    expect(countsFromMap(null)).toEqual([]);
  });

  it("lineRef / plainText format the preview", () => {
    expect(lineRef({ file: "a.ts", start_line: 3, end_line: 3 })).toBe("a.ts:3");
    expect(lineRef({ file: "a.ts", start_line: 3, end_line: 9 })).toBe("a.ts:3-9");
    expect(plainText("**bold** `code`")).toBe("bold code");
  });
});

describe("FindingsHover", () => {
  it("renders nothing without counts", () => {
    const { container } = renderHover(<FindingsHover counts={[]} items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading popover and calls onShow on hover", () => {
    const onShow = vi.fn();
    renderHover(
      <FindingsHover counts={[{ severity: "WARNING", count: 3 }]} items={undefined} loading onShow={onShow} />,
    );
    fireEvent.mouseEnter(screen.getByLabelText("3 warning"));
    expect(onShow).toHaveBeenCalledOnce();
    expect(screen.getByRole("tooltip")).toHaveTextContent("3 findings in this run");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Loading findings…");
  });
});
