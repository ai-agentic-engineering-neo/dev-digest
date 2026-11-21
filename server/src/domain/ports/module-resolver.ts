/** Port — source of truth is server/src/domain/ports (SPEC-16). */

/** Why a specifier could not be resolved (`external`/`builtin` are their own kinds). */
export type ModuleResolveFailure = 'missing' | 'tsconfig' | 'outside_clone';

export type ModuleResolution =
  | { kind: 'file'; path: string }
  | { kind: 'external' }
  | { kind: 'builtin' }
  | { kind: 'unresolved'; reason: ModuleResolveFailure };

export interface ModuleResolverTsconfigFailure {
  path: string;
  message: string;
}

export interface ModuleResolverInput {
  /** Absolute clone root. Nothing outside it is ever read. */
  root: string;
  /** Repo-relative (posix) files that exist in the clone — the ONLY filesystem view. */
  files: ReadonlySet<string>;
  /** Repo-relative read; `null` when unreadable. Implementations must not follow symlinks out of the clone. */
  readText(rel: string): string | null;
}

export interface ModuleResolverInstance {
  /** `fromFile` is repo-relative. Never throws. */
  resolve(fromFile: string, specifier: string): ModuleResolution;
  tsconfigFailures(): ModuleResolverTsconfigFailure[];
}

export interface ModuleResolver {
  create(input: ModuleResolverInput): ModuleResolverInstance;
}
