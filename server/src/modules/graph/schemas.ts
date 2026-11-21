import { z } from 'zod';
import {
  DEFAULT_FILE_PAGE_SIZE,
  DEFAULT_UNRESOLVED_PAGE_SIZE,
  MAX_FILE_PAGE_SIZE,
  MAX_UNRESOLVED_PAGE_SIZE,
  ProjectGraphFileSort,
} from '@devdigest/shared';

/**
 * A repo-relative path that is already normalised (specs/18 non-functional:
 * path containment). We reject rather than "fix" anything suspicious: leading
 * `/`, `..`/`.` segments, empty segments (`a//b`), trailing `/`, backslashes,
 * NUL/control characters. Existence in the index is checked by the reader.
 */
export const RepoRelPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !/[\u0000-\u001f\u007f\\]/.test(p), 'path contains control or backslash characters')
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p), 'path must be repo-relative')
  .refine((p) => !p.endsWith('/'), 'path must not end with "/"')
  .refine(
    (p) => p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..'),
    'path must be normalised (no "..", ".", or empty segments)',
  );

const Page = z.coerce.number().int().min(1).max(100_000).default(1);

export const GraphQuery = z
  .object({
    dir: RepoRelPath.optional(),
    file: RepoRelPath.optional(),
    depth: z.coerce.number().int().min(1).max(32).optional(),
    page: Page,
  })
  .refine((q) => !(q.dir !== undefined && q.file !== undefined), {
    message: '`dir` and `file` are mutually exclusive',
    path: ['file'],
  });
export type GraphQuery = z.infer<typeof GraphQuery>;

export const GraphFilesQuery = z.object({
  dir: RepoRelPath.optional(),
  page: Page,
  page_size: z.coerce.number().int().min(1).max(MAX_FILE_PAGE_SIZE).default(DEFAULT_FILE_PAGE_SIZE),
  sort: ProjectGraphFileSort.default('path'),
});
export type GraphFilesQuery = z.infer<typeof GraphFilesQuery>;

export const GraphUnresolvedQuery = z.object({
  page: Page,
  page_size: z
    .coerce.number()
    .int()
    .min(1)
    .max(MAX_UNRESOLVED_PAGE_SIZE)
    .default(DEFAULT_UNRESOLVED_PAGE_SIZE),
});
export type GraphUnresolvedQuery = z.infer<typeof GraphUnresolvedQuery>;

export const GraphSymbolsQuery = z.object({
  file: RepoRelPath,
  page: Page,
});
export type GraphSymbolsQuery = z.infer<typeof GraphSymbolsQuery>;
