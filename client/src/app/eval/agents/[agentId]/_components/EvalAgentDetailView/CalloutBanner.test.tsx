import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCallout } from "@devdigest/shared/contracts/eval-ci";
import messages from "../../../../../../../messages/en/eval.json";
import { CalloutBanner } from "./CalloutBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CalloutBanner — D12/AC-45", () => {
  it("emits the causal clause naming the flipped cases only when case_transitions is non-empty, and omits it when empty", () => {
    const withTransitions: EvalCallout = {
      metric: "recall",
      direction: "up",
      magnitude: 0.12,
      agent_version: 3,
      case_transitions: [{ case_id: "c1", name: "hardcoded-secret", from: false, to: true }],
    };
    const { unmount } = renderWithIntl(<CalloutBanner callout={withTransitions} />);
    expect(
      screen.getByText("Recall moved up 12% since v3 — cases that changed outcome: hardcoded-secret."),
    ).toBeInTheDocument();
    unmount();

    const withoutTransitions: EvalCallout = { ...withTransitions, case_transitions: [] };
    renderWithIntl(<CalloutBanner callout={withoutTransitions} />);
    expect(screen.getByText("Recall moved up 12% since v3.")).toBeInTheDocument();
    expect(screen.queryByText(/cases that changed outcome/)).not.toBeInTheDocument();
  });

  it("renders an em dash for a null agent_version", () => {
    const callout: EvalCallout = {
      metric: "precision",
      direction: "down",
      magnitude: 0.08,
      agent_version: null,
      case_transitions: [],
    };
    renderWithIntl(<CalloutBanner callout={callout} />);
    expect(screen.getByText("Precision moved down 8% since v—.")).toBeInTheDocument();
  });
});
