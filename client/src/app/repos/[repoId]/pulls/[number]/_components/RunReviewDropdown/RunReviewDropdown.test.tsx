import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown repoId="r1" prId="pr1" prNumber={5} />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown compare agents", () => {
  it("opens the menu and navigates to the multi-agent page for this PR", () => {
    renderWithIntl(<RunReviewDropdown repoId="r1" prId="pr1" prNumber={5} />);
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Compare agents…"));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?pr=5");
  });
});
