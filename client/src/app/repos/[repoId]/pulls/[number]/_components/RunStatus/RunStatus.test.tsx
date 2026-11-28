import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({ running: false }));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: state.running }),
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  state.running = false;
});

function ui(onDone?: () => void) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunStatus runIds={["r1"]} onDone={onDone} />
    </NextIntlClientProvider>
  );
}

describe("RunStatus", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunStatus runIds={[]} />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onDone once when the run ends, not on later re-renders", () => {
    const onDone = vi.fn();
    state.running = true;
    const { rerender } = render(ui(onDone));
    expect(onDone).not.toHaveBeenCalled();

    state.running = false;
    rerender(ui(onDone));
    expect(onDone).toHaveBeenCalledTimes(1);

    // A new callback identity (a parent re-render) must not fire it again.
    rerender(ui(() => onDone()));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone for a run that was never seen running", () => {
    const onDone = vi.fn();
    render(ui(onDone));
    expect(onDone).not.toHaveBeenCalled();
  });
});
