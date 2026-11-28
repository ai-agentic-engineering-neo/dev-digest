import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * True when the module whose `import.meta.url` is given was started directly
 * (`tsx src/db/migrate.ts`), not imported.
 *
 * Comparing `import.meta.url` with a hand-built `file://${process.argv[1]}`
 * only works for POSIX paths without special characters: on Windows argv[1]
 * is `C:\…` while the URL is `file:///C:/…`, and spaces are percent-encoded
 * everywhere, so the CLI silently did nothing. Converting the path with
 * `pathToFileURL` produces the same form Node uses for `import.meta.url`.
 */
export function isEntrypoint(
  importMetaUrl: string,
  argv1: string | undefined = process.argv[1],
  opts: { windows?: boolean } = {},
): boolean {
  if (!argv1) return false;
  const windows = opts.windows ?? process.platform === 'win32';
  // path.resolve would mangle a Windows path on POSIX (tests), so only
  // resolve relative paths for the current platform.
  const abs = windows ? argv1 : resolve(argv1);
  return pathToFileURL(abs, { windows }).href === importMetaUrl;
}
