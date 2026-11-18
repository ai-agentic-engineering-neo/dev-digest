import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBlockedAddress } from '../src/platform/net-policy.js';
import { safeFetch } from '../src/adapters/http/safe-fetch.js';
import { BlockedHostError } from '../src/domain/ports/http.js';
import { assertPublicHttpUrl } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';
import { readContainedFile } from '../src/modules/_shared/checkout-paths.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';

// ---------------------------------------------------------------- S7 ------

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.1',
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '::1',
    '[::1]',
    '::',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::ffff:7f00:1]',
    '0:0:0:0:0:ffff:a9fe:a9fe',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '140.82.112.3', '2606:4700::1111', '::ffff:808:808'])('allows public %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('assertPublicHttpUrl — literal forms the old regex missed', () => {
  it.each([
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://0x7f.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://foo.localhost/',
    'http://localhost./',
    'http://[fd00::1]/',
    'http://100.64.0.1/',
    'https://user:pw@example.com/a.md',
  ])('rejects %s', (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow(ValidationError);
  });
});

describe('safeFetch (connect-time guard)', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('INTERNAL SECRET');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const init = () => ({ signal: new AbortController().signal, redirect: 'manual' as const });

  it('refuses an IP-literal loopback target', async () => {
    await expect(safeFetch(new URL(`http://127.0.0.1:${port}/`), init())).rejects.toBeInstanceOf(BlockedHostError);
  });

  it('refuses a HOSTNAME that resolves to loopback (what the old guard let through)', async () => {
    // `localhost` stands in for attacker DNS pointing at 127.0.0.1 — the
    // lookup guard sees the resolved address, not the name.
    await expect(safeFetch(new URL(`http://localhost:${port}/`), init())).rejects.toBeInstanceOf(BlockedHostError);
  });
});

describe('SkillsService.parseImportFromUrl with a guarded fetch', () => {
  it('maps a connect-time refusal to a 4xx validation error, not a generic failure', async () => {
    const repo = { getByName: async () => undefined } as unknown as SkillsRepository;
    const tokenizer = { count: (s: string) => s.length } as unknown as Tokenizer;
    const httpFetch = vi.fn(async (url: URL) => {
      throw new BlockedHostError(url.hostname);
    });
    const service = new SkillsService(repo, tokenizer, undefined as never, undefined, httpFetch);
    await expect(service.parseImportFromUrl('ws', 'https://rebind.example/skill.md')).rejects.toThrow(
      'This host cannot be fetched',
    );
    expect(httpFetch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------- S6 ------

describe('readContainedFile', () => {
  let root: string;
  let clone: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dd-contained-'));
    clone = join(root, 'clone');
    await mkdir(join(clone, 'src'), { recursive: true });
    await writeFile(join(root, '.env'), 'OPENAI_API_KEY=sk-secret\n');
    await writeFile(join(clone, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(clone, 'big.txt'), 'x'.repeat(64));
    await symlink('../.env', join(clone, '.prettierrc'));
    await symlink('src/a.ts', join(clone, 'inside-link.ts'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a normal file', async () => {
    expect(await readContainedFile(clone, 'src/a.ts')).toBe('export const a = 1;\n');
  });

  it('refuses a committed symlink that points outside the clone', async () => {
    expect(await readContainedFile(clone, '.prettierrc')).toBeNull();
  });

  it('still follows a symlink that stays inside the clone', async () => {
    expect(await readContainedFile(clone, 'inside-link.ts')).toBe('export const a = 1;\n');
  });

  it('refuses traversal, absolute paths, directories and oversized files', async () => {
    expect(await readContainedFile(clone, '../.env')).toBeNull();
    expect(await readContainedFile(clone, join(root, '.env'))).toBeNull();
    expect(await readContainedFile(clone, 'src')).toBeNull();
    expect(await readContainedFile(clone, 'big.txt', { maxBytes: 10 })).toBeNull();
    expect(await readContainedFile(clone, 'missing.ts')).toBeNull();
  });
});
