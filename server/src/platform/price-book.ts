import type { ModelInfo } from '@devdigest/shared';

type Estimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Live OpenRouter pricing for cost attribution (Settings spec, Feature 2).
 *
 * OpenRouter's `/models` endpoint returns per-model prices (USD per 1M tokens),
 * so we cache them and use them for `estimateCost` instead of relying on a
 * hardcoded table for the models we actually run. The cache refreshes lazily
 * (non-blocking) on a TTL; until it is warm — and for non-OpenRouter models,
 * whose APIs don't expose prices — we fall back to the static table.
 *
 * `estimate` is SYNCHRONOUS by design: it is injected into the OpenRouter
 * provider's per-call cost hook, which cannot await. The first call after a
 * cold start (or expiry) returns the fallback while a refresh runs in the
 * background; subsequent calls use the live prices.
 */
export class PriceBook {
  private prices = new Map<string, { in: number; out: number }>();
  private expires = 0;
  private refreshing = false;

  constructor(
    private listOpenRouterModels: () => Promise<ModelInfo[]>,
    private fallback: Estimator,
    private ttlMs = SIX_HOURS_MS,
    private now: () => number = () => Date.now(),
  ) {}

  /** Synchronous cost in USD: live OpenRouter price if cached, else the fallback table. */
  estimate(model: string, tokensIn: number, tokensOut: number): number | null {
    this.maybeRefresh();
    const p = this.prices.get(model);
    if (p) return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
    return this.fallback(model, tokensIn, tokensOut);
  }

  /**
   * The cached LIVE OpenRouter price (USD per 1M tokens) for a model, or null
   * when it is not in the live list — no static-table fallback. Call `refresh()`
   * first; used by the cost backfill, which must not guess from stale tables.
   */
  livePrice(model: string): { in: number; out: number } | null {
    return this.prices.get(model) ?? null;
  }

  /** Force a synchronous-await refresh (e.g. to warm the cache). Never throws. */
  async refresh(): Promise<void> {
    try {
      this.ingest(await this.listOpenRouterModels());
      this.expires = this.now() + this.ttlMs;
    } catch {
      this.expires = 0;
    }
  }

  private ingest(models: ModelInfo[]): void {
    for (const m of models) {
      if (m.pricing) {
        this.prices.set(m.id, { in: m.pricing.promptPerM, out: m.pricing.completionPerM });
      }
    }
  }

  private maybeRefresh(): void {
    if (this.refreshing) return;
    if (this.now() < this.expires && this.prices.size > 0) return;
    this.refreshing = true;
    this.expires = this.now() + this.ttlMs; // set early so concurrent calls don't stampede
    this.listOpenRouterModels()
      .then((models) => this.ingest(models))
      .catch(() => {
        this.expires = 0; // allow a retry on the next call
      })
      .finally(() => {
        this.refreshing = false;
      });
  }
}
