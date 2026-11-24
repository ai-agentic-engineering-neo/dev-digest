import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(cleanup);

const REVIEW: ReviewRecord = {
  id: "rev1",
  pr_id: "pr1",
  agent_id: "ag1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at: "2026-11-20T10:00:00Z",
  findings: [],
};

function ui(props: { targetRunId?: string | null; targetNonce?: number }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion review={REVIEW} prId="pr1" {...props} />
    </NextIntlClientProvider>
  );
}
const isOpen = () => screen.queryByText("Hide low confidence") !== null;

describe("ReviewRunAccordion targeting", () => {
  it("stays collapsed when not targeted", () => {
    render(ui({ targetRunId: "other", targetNonce: 1 }));
    expect(isOpen()).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens and scrolls when targeted on mount", () => {
    render(ui({ targetRunId: "run1", targetNonce: 1 }));
    expect(isOpen()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("opens and scrolls when the target switches to this run", () => {
    const { rerender } = render(ui({ targetRunId: null, targetNonce: 0 }));
    expect(isOpen()).toBe(false);
    rerender(ui({ targetRunId: "run1", targetNonce: 1 }));
    expect(isOpen()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("re-opens and re-scrolls on a new nonce after the user collapsed it", () => {
    const { rerender } = render(ui({ targetRunId: "run1", targetNonce: 1 }));
    fireEvent.click(screen.getByRole("button", { name: /Security Reviewer/ }));
    expect(isOpen()).toBe(false);
    rerender(ui({ targetRunId: "run1", targetNonce: 2 }));
    expect(isOpen()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
