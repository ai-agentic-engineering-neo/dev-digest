/* hooks/run-events-store.ts — external store behind useRunEvents.

   One EventSource per run id, shared by every component that watches that run
   and ref-counted: `retain(runId)` opens the stream on first use, the returned
   release closes it once nobody watches it any more. Adding a second run never
   restarts the first one's stream, so its log survives.

   A stream is finished when
     - the server sends its terminal status event (`data.status` is
       done/failed/cancelled — sent for runs that already ended, then it closes),
     - or the connection errors / closes (end of a live stream, 404 unknown run).
   It is then closed (no EventSource auto-reconnect) and `onFinish` fires once,
   so the owner can refresh the PR's run and review queries. */

import type { RunEvent } from "@devdigest/shared";

export interface RunStreamState {
  /** Events in arrival order, each tagged with a store-wide arrival index. */
  events: { n: number; event: RunEvent }[];
  done: boolean;
}

type Listener = () => void;

export type RunEventsSnapshot = ReadonlyMap<string, RunStreamState>;
export const EMPTY_RUN_EVENTS: RunEventsSnapshot = new Map();

interface Entry {
  state: RunStreamState;
  source: EventSource | null;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);
/** SSE `event:` names the server uses (RunEventKind); default messages are handled too. */
const EVENT_NAMES = ["info", "tool", "result", "error"] as const;
/** A release is deferred this long so an immediate re-retain (StrictMode, a
    changed run list) keeps the open stream instead of reconnecting. */
const RELEASE_GRACE_MS = 0;

export function isTerminalEvent(event: RunEvent): boolean {
  const status = (event.data as { status?: unknown } | null | undefined)?.status;
  return typeof status === "string" && TERMINAL_STATUSES.has(status);
}

export interface RunEventsStoreOptions {
  url: (runId: string) => string;
  /** Called once per `error` event with a message (runtime agent failures). */
  onErrorEvent?: (msg: string) => void;
  /** Called once when a run's stream finishes (terminal event, close or error). */
  onFinish?: (runId: string) => void;
}

export class RunEventsStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  private arrival = 0;
  private snapshot: RunEventsSnapshot = EMPTY_RUN_EVENTS;

  constructor(private readonly options: RunEventsStoreOptions) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Immutable run id → state map, replaced on every change (useSyncExternalStore). */
  getSnapshot = (): RunEventsSnapshot => this.snapshot;

  /** Watch a run; returns the release function. */
  retain(runId: string): () => void {
    let entry = this.entries.get(runId);
    if (entry) {
      if (entry.closeTimer) clearTimeout(entry.closeTimer);
      entry.closeTimer = null;
    } else {
      entry = { state: { events: [], done: false }, source: null, refs: 0, closeTimer: null };
      this.entries.set(runId, entry);
      this.open(runId, entry);
      this.emit();
    }
    entry.refs += 1;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(runId);
    };
  }

  private release(runId: string) {
    const entry = this.entries.get(runId);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.closeTimer = setTimeout(() => {
      if (entry.refs > 0 || this.entries.get(runId) !== entry) return;
      entry.source?.close();
      this.entries.delete(runId);
      this.emit();
    }, RELEASE_GRACE_MS);
  }

  private open(runId: string, entry: Entry) {
    const source = new EventSource(this.options.url(runId));
    entry.source = source;

    const onMessage = (ev: MessageEvent) => {
      let parsed: RunEvent;
      try {
        parsed = JSON.parse(ev.data) as RunEvent;
      } catch {
        return; // keepalive frames and dataless native error events
      }
      this.push(entry, parsed);
      if (parsed.kind === "error" && parsed.msg) this.options.onErrorEvent?.(parsed.msg);
      if (isTerminalEvent(parsed)) this.finish(runId, entry);
    };

    source.onmessage = onMessage;
    for (const name of EVENT_NAMES) source.addEventListener(name, onMessage as EventListener);
    // End of a live stream, a 404 for an unknown run, or a dropped connection:
    // stop here instead of letting EventSource reconnect and replay the log.
    source.onerror = () => this.finish(runId, entry);
  }

  private push(entry: Entry, event: RunEvent) {
    if (entry.state.done) return;
    const n = this.arrival++;
    entry.state = { ...entry.state, events: [...entry.state.events, { n, event }] };
    this.emit();
  }

  private finish(runId: string, entry: Entry) {
    if (entry.state.done) return;
    entry.source?.close();
    entry.source = null;
    entry.state = { ...entry.state, done: true };
    this.emit();
    this.options.onFinish?.(runId);
  }

  private emit() {
    this.snapshot = new Map([...this.entries].map(([id, e]) => [id, e.state]));
    for (const listener of this.listeners) listener();
  }
}

/** Merge several runs' events into one arrival-ordered list. */
export function mergeRunEvents(states: (RunStreamState | undefined)[]): RunEvent[] {
  return states
    .flatMap((s) => s?.events ?? [])
    .sort((a, b) => a.n - b.n)
    .map((e) => e.event);
}
