import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { isEntrypoint } from '../src/db/entrypoint.js';

describe('isEntrypoint (db:migrate / db:seed CLI guard)', () => {
  it('matches a Windows drive-letter path (previously a silent no-op)', () => {
    const url = 'file:///C:/Users/User/code/dev-digest/server/src/db/migrate.ts';
    const argv1 = 'C:\\Users\\User\\code\\dev-digest\\server\\src\\db\\migrate.ts';
    expect(isEntrypoint(url, argv1, { windows: true })).toBe(true);
  });

  it('matches a POSIX path containing spaces (percent-encoded in the URL)', () => {
    const argv1 = '/home/me/my code/server/src/db/seed.ts';
    expect(isEntrypoint(pathToFileURL(argv1).href, argv1, { windows: false })).toBe(true);
  });

  it('is false when the module was imported by another script', () => {
    const url = 'file:///repo/server/src/db/migrate.ts';
    expect(isEntrypoint(url, '/repo/server/test/helpers/pg.ts', { windows: false })).toBe(false);
    expect(isEntrypoint(url, undefined)).toBe(false);
  });
});
