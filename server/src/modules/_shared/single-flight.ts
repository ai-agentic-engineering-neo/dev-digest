/** Concurrent callers for one key share ONE promise. In-memory, per process. */
export class SingleFlight<T> {
  private readonly flights = new Map<string, Promise<T>>();

  /** Joins the promise in flight for `key`, or starts `fn()` and registers it synchronously. */
  run(key: string, fn: () => Promise<T>): { promise: Promise<T>; joined: boolean } {
    const existing = this.flights.get(key);
    if (existing) return { promise: existing, joined: true };
    return { promise: this.start(key, fn), joined: false };
  }

  /** Waits (ignoring outcomes) until nothing is in flight for `key`, then starts `fn()`. Never joins. */
  async runAfter(key: string, fn: () => Promise<T>): Promise<T> {
    for (let p = this.flights.get(key); p; p = this.flights.get(key)) {
      await p.catch(() => undefined);
    }
    return this.start(key, fn);
  }

  has(key: string): boolean {
    return this.flights.has(key);
  }

  get size(): number {
    return this.flights.size;
  }

  private start(key: string, fn: () => Promise<T>): Promise<T> {
    const promise = fn();
    this.flights.set(key, promise);
    const clear = (): void => {
      if (this.flights.get(key) === promise) this.flights.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }
}

export interface NegativeHit {
  reason: string;
  retryInMs: number;
}

interface NegativeEntry {
  headSha: string;
  inputHash: string;
  reason: string;
  expiresAt: number;
}

/** Remembers one recent failure per key, matched on (headSha, inputHash). */
export class NegativeCache {
  private readonly entries = new Map<string, NegativeEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, match: { headSha: string; inputHash: string }): NegativeHit | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    const t = this.now();
    if (t >= e.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    if (e.headSha !== match.headSha || e.inputHash !== match.inputHash) return undefined;
    return { reason: e.reason, retryInMs: e.expiresAt - t };
  }

  set(key: string, entry: { headSha: string; inputHash: string; reason: string }): void {
    const t = this.now();
    for (const [k, v] of this.entries) if (t >= v.expiresAt) this.entries.delete(k);
    this.entries.set(key, { ...entry, expiresAt: t + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
