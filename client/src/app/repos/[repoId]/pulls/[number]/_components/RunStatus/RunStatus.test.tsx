import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const state = { running: false };

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: state.running }),
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  state.running = false;
});

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("RunStatus (smoke)", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = render(wrap(<RunStatus runIds={[]} />));
    expect(container.firstChild).toBeNull();
  });
});

describe("RunStatus onDone", () => {
  it("fires exactly once on the running → idle edge, even if the parent re-renders with a new inline callback", () => {
    const onDone = vi.fn();
    state.running = true;
    const { rerender } = render(wrap(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    expect(onDone).not.toHaveBeenCalled();

    state.running = false;
    rerender(wrap(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    expect(onDone).toHaveBeenCalledTimes(1);

    // Parent re-renders (e.g. after the refetch onDone triggers) with a fresh arrow.
    rerender(wrap(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    rerender(wrap(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not fire when a run never started", () => {
    const onDone = vi.fn();
    render(wrap(<RunStatus runIds={["r1"]} onDone={onDone} />));
    expect(onDone).not.toHaveBeenCalled();
  });
});
