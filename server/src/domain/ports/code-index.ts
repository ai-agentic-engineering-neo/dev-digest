/** Port — source of truth is server/src/domain/ports (SPEC-16). */
import type {
  RepoRef,
  CodeMatch,
  CodeSymbol,
  CodeReference,
} from '../../vendor/shared/adapters.js';

export interface CodeIndex {
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  symbols(repo: RepoRef): Promise<CodeSymbol[]>;
  references(repo: RepoRef, symbol: string): Promise<CodeReference[]>;
}
