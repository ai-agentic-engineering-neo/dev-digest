/* useRunEvents — SSE subscription per runId. A fake EventSource on globalThis
   lets the test push frames and observe close(). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { API_BASE } from "../api";
import { notify } from "../toast";
import { useRunEvents } from "./reviews";

vi.mock("../toast", () => ({ notify: { error: vi.fn() } }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, Array<(ev: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  /** Deliver a frame as a default `message` or as a named SSE event. */
  emit(data: string, type = "message") {
    const ev = new MessageEvent(type, { data });
    act(() => {
      if (type === "message") this.onmessage?.(ev);
      else for (const fn of this.listeners.get(type) ?? []) fn(ev);
    });
  }
  fail() {
    act(() => this.onerror?.(new Event("error")));
  }
}

const ev = (runId: string, seq: number, kind = "info", msg = `step ${seq}`) =>
  JSON.stringify({ runId, seq, kind, msg, t: "00.01" });

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(notify.error).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useRunEvents", () => {
  it("opens one source per run and collects only valid RunEvents", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useRunEvents(["r1", "r2"]));

    expect(FakeEventSource.instances.map((s) => s.url)).toEqual([
      `${API_BASE}/runs/r1/events`,
      `${API_BASE}/runs/r2/events`,
    ]);
    expect(result.current.running).toBe(true);

    const [s1, s2] = FakeEventSource.instances;
    s1!.emit(ev("r1", 1)); // default message
    s1!.emit(": keepalive"); // non-JSON → skipped silently
    s2!.emit(ev("r2", 1, "tool", "read_file a.ts"), "tool"); // named event
    s2!.emit(JSON.stringify({ runId: "r2", seq: 2, kind: "bogus", msg: "x", t: "0" }), "info"); // contract violation
    s1!.emit(""); // dataless frame
    s1!.emit(ev("r1", 2, "result", "done"), "result");

    expect(result.current.events.map((e) => [e.runId, e.seq, e.kind])).toEqual([
      ["r1", 1, "info"],
      ["r2", 1, "tool"],
      ["r1", 2, "result"],
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("raises an error toast for a runtime `error` event and still records it", () => {
    const { result } = renderHook(() => useRunEvents(["r1"]));
    FakeEventSource.instances[0]!.emit(ev("r1", 1, "error", "LLM quota exceeded"), "error");

    expect(notify.error).toHaveBeenCalledWith("LLM quota exceeded");
    expect(result.current.events).toHaveLength(1);
  });

  it("closes each source on error and stops running once all have closed", () => {
    const { result } = renderHook(() => useRunEvents(["r1", "r2"]));
    const [s1, s2] = FakeEventSource.instances;

    s1!.fail();
    expect(s1!.closed).toBe(true);
    expect(s2!.closed).toBe(false);
    expect(result.current.running).toBe(true);

    s2!.fail();
    expect(s2!.closed).toBe(true);
    expect(result.current.running).toBe(false);
  });

  it("closes every source on unmount", () => {
    const { unmount } = renderHook(() => useRunEvents(["r1", "r2"]));
    unmount();
    expect(FakeEventSource.instances.every((s) => s.closed)).toBe(true);
  });

  it("re-subscribes with fresh events when the run ids change", () => {
    const { result, rerender } = renderHook(({ ids }) => useRunEvents(ids), {
      initialProps: { ids: ["r1"] },
    });
    FakeEventSource.instances[0]!.emit(ev("r1", 1));
    expect(result.current.events).toHaveLength(1);

    rerender({ ids: ["r3"] });
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(FakeEventSource.instances[1]!.url).toBe(`${API_BASE}/runs/r3/events`);
    expect(result.current.events).toEqual([]);
    expect(result.current.running).toBe(true);

    // Same ids in a new array → same key → no resubscription.
    rerender({ ids: ["r3"] });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("opens nothing and is not running for an empty id list", () => {
    const { result } = renderHook(() => useRunEvents([]));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current).toEqual({ events: [], running: false });
  });
});
