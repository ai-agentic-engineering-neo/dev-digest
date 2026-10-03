/** Directory names never descended into during discovery (any depth). */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'vendor']);

/** File names never offered as context — directory index/readme files, not specs. */
export const EXCLUDED_FILE_NAMES: ReadonlySet<string> = new Set(['readme.md']);

/** Discovery stops after this many documents per repo; the list is marked truncated. */
export const MAX_CONTEXT_DOCS = 1000;

/** Error code the client keys its "repository not cloned" state on. */
export const NOT_CLONED_CODE = 'repo_not_cloned';
