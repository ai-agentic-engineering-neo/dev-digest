/* test/fake-event-source.ts — a controllable EventSource for SSE hooks.
   installFakeEventSource() stubs the global; tests then drive each stream:
     const es = FakeEventSource.for("run-1");
     es.emit("info", { runId: "run-1", seq: 1, kind: "info", msg: "hi", t: "00.10" });
     es.fail(); // server closed the stream / 404 */
import { vi } from "vitest";

type Handler = (ev: MessageEvent) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: Handler | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, Set<Handler>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  /** Streams opened for a run id (matched on `/runs/<id>/events`). */
  static all(runId: string): FakeEventSource[] {
    return FakeEventSource.instances.filter((es) => es.url.endsWith(`/runs/${runId}/events`));
  }

  /** The latest stream opened for a run id. */
  static for(runId: string): FakeEventSource {
    const found = FakeEventSource.all(runId).at(-1);
    if (!found) throw new Error(`no EventSource opened for run ${runId}`);
    return found;
  }

  addEventListener(type: string, handler: Handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: Handler) {
    this.listeners.get(type)?.delete(handler);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Deliver a named SSE event (`event: <type>`), as the server sends RunEvents. */
  emit(type: string, data: unknown) {
    if (this.readyState === FakeEventSource.CLOSED) return;
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((h) => h(ev));
  }

  /** Deliver an unnamed message (dispatched to onmessage). */
  message(data: unknown) {
    if (this.readyState === FakeEventSource.CLOSED) return;
    this.onmessage?.(new MessageEvent("message", { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }

  /** Connection error / server closed the stream. */
  fail() {
    if (this.readyState === FakeEventSource.CLOSED) return;
    this.onerror?.(new Event("error"));
  }
}

export function installFakeEventSource(): typeof FakeEventSource {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  return FakeEventSource;
}
