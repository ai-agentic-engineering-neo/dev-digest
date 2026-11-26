/** Skills module constants (data only). */
import type { ConventionCategory } from '@devdigest/shared';

/** Every skill starts at v1. */
export const INITIAL_SKILL_VERSION = 1;

/** Default source of a new skill (the Conventions Extractor passes `extracted`). */
export const MANUAL_SOURCE = 'manual' as const;

export const INITIAL_VERSION_MESSAGE = 'Initial version';
export const EDITED_BODY_MESSAGE = 'Edited body';
export const restoredFromMessage = (version: number): string => `Restored from v${version}`;

/** Stats panel window ("Agent activity, last 30 days"). */
export const STATS_WINDOW_DAYS = 30;

/** Only completed runs count towards agent activity. */
export const DONE_RUN_STATUS = 'done';

/** Postgres unique_violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';

// ---- Agent suggestions (GET /skills/:id/agent-suggestions; code only, no LLM) ----

/** Signal weights; a skill with no convention categories moves that weight to keywords. */
export const SUGGESTION_WEIGHTS = { category: 0.4, type: 0.3, keywords: 0.3 } as const;
export const SUGGESTION_WEIGHTS_NO_CATEGORY = { category: 0, type: 0.3, keywords: 0.7 } as const;

/** score ≥ this → the dialog starts on "Accept". */
export const PRESELECT_THRESHOLD = 0.5;
/** At most this many agents are suggested (best first). */
export const MAX_AGENT_SUGGESTIONS = 10;
/** Same-type links that saturate the type signal; shared words that saturate keywords. */
export const TYPE_SATURATION = 2;
export const KEYWORD_SATURATION = 3;
/** Keywords listed in a reason. */
export const MAX_REASON_KEYWORDS = 5;
/** Only the start of the body (code fences removed) is tokenized. */
export const SUGGESTION_BODY_CHARS = 4000;
export const MIN_TOKEN_LENGTH = 3;

/** Words in an agent's name / description that point at a convention category. `general` has none. */
export const CATEGORY_KEYWORDS = {
  naming: ['name', 'naming', 'identifier', 'readability', 'clarity', 'style'],
  structure: ['structure', 'architecture', 'layout', 'layer', 'module', 'organization', 'maintainability', 'design'],
  errors: ['error', 'exception', 'failure', 'crash', 'handling', 'retry', 'correctness', 'bug'],
  imports: ['import', 'dependency', 'package', 'boundary'],
  typing: ['type', 'typing', 'typescript', 'typed', 'null', 'safety'],
  testing: ['test', 'testing', 'coverage', 'mock', 'assertion', 'spec'],
  api: ['api', 'contract', 'endpoint', 'schema', 'route', 'rest', 'http', 'request', 'response'],
  general: [],
} as const satisfies Record<ConventionCategory, readonly string[]>;

/** English stop-words plus words every reviewer / skill text carries. */
export const SUGGESTION_STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under', 'about',
  'should', 'must', 'shall', 'will', 'would', 'could', 'can', 'may', 'might', 'when', 'where',
  'before', 'after', 'while', 'then', 'than', 'also', 'only', 'just', 'each', 'every', 'any',
  'all', 'some', 'not', 'nor', 'but', 'are', 'was', 'were', 'been', 'being', 'have', 'has',
  'had', 'does', 'did', 'doing', 'its', 'our', 'your', 'their', 'them', 'they', 'you', 'who',
  'what', 'which', 'why', 'how', 'here', 'there', 'these', 'those', 'such', 'very', 'more',
  'most', 'other', 'same', 'via', 'per', 'out', 'off', 'own', 'too', 'yet', 'use', 'used',
  'using', 'like', 'make', 'never', 'always', 'prefer', 'avoid', 'instead', 'one', 'two',
  // domain-generic
  'review', 'reviewer', 'code', 'diff', 'flag', 'catch', 'merge', 'skill', 'rule', 'agent',
  'file', 'repo',
]);
