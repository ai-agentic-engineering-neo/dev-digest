import { Lang } from '@ast-grep/napi';
import { extname } from 'node:path';

import { SUPPORTED_EXT } from '../code-scope.js';

// ---------------------------------------------------------------------------
// Lang mapping — accepts SUPPORTED_EXT and falls back to null otherwise.
// ---------------------------------------------------------------------------

export const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export function langForFile(file: string): Lang | null {
  const ext = extname(file).toLowerCase();
  switch (ext) {
    case '.ts':
      return Lang.TypeScript;
    case '.tsx':
      return Lang.Tsx;
    case '.jsx':
      // tree-sitter ships JSX inside the TSX grammar; the existing TS toolchain
      // happily parses JSX as TSX (the only difference is `<Foo>` cast syntax,
      // which Tsx rejects — fine for indexing).
      return Lang.Tsx;
    case '.js':
    case '.cjs':
    case '.mjs':
      return Lang.JavaScript;
    default:
      return null;
  }
}
