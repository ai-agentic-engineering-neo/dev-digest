/**
 * FindingsPopover — the PR-list hover preview. Read-only by design: Accept /
 * Dismiss only exist on the PR-detail FindingCard, a different component
 * with its own network calls. This popover must never render a button.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Finding } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsPopover } from "./FindingsPopover";

afterEach(cleanup);

const FINDINGS: Finding[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_, which appears to be a Stripe secret key.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop on line 46 calls db.posts.findMany({ userId }) once per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
  },
];

// A stand-in for a real getBoundingClientRect() snapshot — geometry doesn't
// matter for these tests, only that a non-null anchor is present.
const ANCHOR = new DOMRect(100, 200, 120, 24);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPopover", () => {
  it("shows the total count in the title, not just the preview length", () => {
    renderWithIntl(<FindingsPopover findings={FINDINGS} total={6} anchorRect={ANCHOR} />);
    expect(screen.getByText("6 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("shows severity, title, category, file:line and confidence for each preview finding", () => {
    renderWithIntl(<FindingsPopover findings={FINDINGS} total={2} anchorRect={ANCHOR} />);
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();

    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText("perf")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(screen.getByText("86% conf")).toBeInTheDocument();
  });

  it("never renders an interactive control — read-only preview", () => {
    renderWithIntl(<FindingsPopover findings={FINDINGS} total={2} anchorRect={ANCHOR} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("[onclick]")).toHaveLength(0);
  });

  it("renders nothing when there's no anchor yet (not open)", () => {
    const { container } = renderWithIntl(
      <FindingsPopover findings={FINDINGS} total={2} anchorRect={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders through a portal into document.body, not wherever it's mounted — this is the fix for the overflow:hidden clipping bug (the PR-list table card clips absolutely-positioned children)", () => {
    const mountPoint = document.createElement("div");
    document.body.appendChild(mountPoint);
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPopover findings={FINDINGS} total={2} anchorRect={ANCHOR} />
      </NextIntlClientProvider>,
      { container: mountPoint },
    );
    const tooltip = screen.getByRole("tooltip");
    expect(mountPoint.contains(tooltip)).toBe(false);
    expect(document.body.contains(tooltip)).toBe(true);
    document.body.removeChild(mountPoint);
  });
});
