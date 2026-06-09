/**
 * A3 — deterministic repo analyzer for the onboarding generator.
 *
 * Thin facade kept for backwards-compatible imports (`./analyzer.js`). The
 * implementation now lives in:
 *   - facts.ts            — analyzeRepo / emptyFacts / aggregation
 *   - fs-walk.ts          — filesystem traversal & IO
 *   - parsers/routes.ts   — route/endpoint parsers + regexes
 */
export { analyzeRepo, emptyFacts } from './facts.js';
export type { ApiEndpoint, KeyFile, RepoFacts } from './facts.js';
