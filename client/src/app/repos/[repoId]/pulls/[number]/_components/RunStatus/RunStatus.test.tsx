import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, act, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { FakeEventSource, installFakeEventSource } from "@/test/fake-event-source";
import { RunStatus } from "./RunStatus";

// The real useRunEvents runs against a fake EventSource the test drives.
beforeEach(() => {
  installFakeEventSource();
  mockFetch();
});
afterEach(cleanup);

const event = (runId: string, seq: number, msg: string, data?: unknown) => ({
  runId,
  seq,
  kind: "info",
  msg,
  t: `00.${seq}0`,
  ...(data ? { data } : {}),
});
const send = (runId: string, seq: number, msg: string, data?: unknown) =>
  act(() => FakeEventSource.for(runId).emit("info", event(runId, seq, msg, data)));

describe("RunStatus", () => {
  it("renders nothing when there are no run ids", () => {
    renderWithProviders(
      <div data-testid="host">
        <RunStatus runIds={[]} />
      </div>,
    );
    expect(screen.getByTestId("host")).toBeEmptyDOMElement();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("streams a run's log and calls onDone once when the server's terminal event arrives", async () => {
    const onDone = vi.fn();
    // A fresh inline callback per render must not re-fire onDone.
    const { rerender } = renderWithProviders(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);

    await send("r1", 1, "Loading diff");
    expect(screen.getByText("Loading diff")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await send("r1", 2, "Run finished", { status: "done", error: null });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(FakeEventSource.for("r1").readyState).toBe(FakeEventSource.CLOSED);

    rerender(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);
    rerender(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Loading diff")).toBeInTheDocument(); // log kept after the run ends
  });

  it("a second run joining keeps the first run's stream and log", async () => {
    const { rerender } = renderWithProviders(<RunStatus runIds={["r1"]} />);
    await send("r1", 1, "first run line");

    rerender(<RunStatus runIds={["r1", "r2"]} />);
    await send("r2", 1, "second run line");

    expect(FakeEventSource.all("r1")).toHaveLength(1); // not reconnected
    expect(FakeEventSource.for("r1").readyState).toBe(FakeEventSource.OPEN);
    expect(screen.getByText("first run line")).toBeInTheDocument();
    expect(screen.getByText("second run line")).toBeInTheDocument();
  });

  it("onDone waits for every run; a closed stream (end of live run / 404) also ends it", async () => {
    const onDone = vi.fn();
    renderWithProviders(<RunStatus runIds={["r1", "r2"]} onDone={onDone} />);

    await act(() => FakeEventSource.for("r1").fail());
    expect(onDone).not.toHaveBeenCalled();

    await act(() => FakeEventSource.for("r2").fail());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
