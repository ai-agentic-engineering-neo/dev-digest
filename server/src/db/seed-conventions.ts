/**
 * L02 — demo conventions for acme/payments-api (the demo repo has no clone, so
 * these stand in for one finished extraction). They back the Conventions page
 * e2e flow; a real re-scan of a cloned repo replaces them.
 */
export interface SeedConvention {
  category: 'naming' | 'error-handling' | 'structure' | 'imports' | 'typing' | 'testing' | 'style' | 'other';
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export const SEED_CONVENTIONS_FILES_SAMPLED = 84;

export const SEED_CONVENTIONS: SeedConvention[] = [
  {
    category: 'style',
    rule: 'Always use async/await instead of .then() chains',
    evidencePath: 'src/api/users.ts',
    evidenceLine: 23,
    evidenceSnippet:
      'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
    confidence: 0.91,
  },
  {
    category: 'structure',
    rule: 'Redis access goes through src/lib/redis.ts singleton',
    evidencePath: 'src/lib/redis.ts',
    evidenceLine: 1,
    evidenceSnippet: 'export const redis = new Redis(config.redisUrl);',
    confidence: 0.85,
  },
  {
    category: 'error-handling',
    rule: 'All public route handlers return typed Result<T, ApiError>',
    evidencePath: 'src/api/public/index.ts',
    evidenceLine: 14,
    evidenceSnippet: 'function handler(): Result<Item[], ApiError> {\n  return ok(items);\n}',
    confidence: 0.78,
  },
];
