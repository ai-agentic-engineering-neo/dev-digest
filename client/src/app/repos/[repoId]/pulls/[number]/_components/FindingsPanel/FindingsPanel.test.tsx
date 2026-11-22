import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { MIXED, finding } from "./fixtures.test-data";

const mutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const FINDINGS: FindingRecord[] = [finding("f1", "CRITICAL", 0.95, "Hardcoded secret")];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const ALL_TITLES = ["Critical one", "Warning high conf", "Warning low conf", "Suggestion one"];
const visible = (title: string) => screen.queryByText(title) !== null;
const hideLowToggle = () => screen.getByRole("switch");

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity filter", () => {
  it("renders the per-severity counters for the run", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 WARNING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 SUGGESTION" })).toBeInTheDocument();
  });

  it("filters to one severity and toggles back to the full list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    expect(ALL_TITLES.filter(visible)).toEqual(["Warning high conf", "Warning low conf"]);

    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    expect(ALL_TITLES.filter(visible)).toEqual(ALL_TITLES);
  });

  it("switches directly between severities (single-select)", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    fireEvent.click(screen.getByRole("button", { name: "1 CRITICAL" }));
    expect(ALL_TITLES.filter(visible)).toEqual(["Critical one"]);
    expect(screen.getByRole("button", { name: "2 WARNING" })).toHaveAttribute("aria-pressed", "false");
  });

  it("'Clear filter' restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "1 SUGGESTION" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(ALL_TITLES.filter(visible)).toEqual(ALL_TITLES);
  });

  it("keeps counts fixed when hiding low-confidence findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(hideLowToggle());
    expect(visible("Warning low conf")).toBe(false);
    expect(screen.getByRole("button", { name: "2 WARNING" })).toBeInTheDocument();
  });

  it("shows the empty state when filter + hide-low leave nothing", () => {
    const onlyLowWarning = [finding("c1", "CRITICAL"), finding("w2", "WARNING", 0.5)];
    renderWithIntl(<FindingsPanel findings={onlyLowWarning} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "1 WARNING" }));
    fireEvent.click(hideLowToggle());
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("opens the severity modal and 'Show only these' applies the filter", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" agentName="General Reviewer" />);
    fireEvent.click(screen.getByRole("button", { name: "Show WARNING findings" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("General Reviewer")).toBeInTheDocument();
    expect(within(dialog).getByText("Warning high conf")).toBeInTheDocument();
    expect(within(dialog).queryByText("Critical one")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Show only these" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 WARNING" })).toHaveAttribute("aria-pressed", "true");
    expect(ALL_TITLES.filter(visible)).toEqual(["Warning high conf", "Warning low conf"]);
  });

  it("ignores a/d finding shortcuts while the modal is open", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Show CRITICAL findings" }));
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith({ findingId: "c1", action: "accept", prId: "pr1" });
  });
});
