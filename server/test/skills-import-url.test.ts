import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertPublicHttpUrl } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';

describe('assertPublicHttpUrl (SSRF guard)', () => {
  it('accepts http/https URLs to a public-looking host', () => {
    expect(assertPublicHttpUrl('https://example.com/skills/security.md').href).toBe(
      'https://example.com/skills/security.md',
    );
  });

  it('rejects a non-URL string', () => {
    expect(() => assertPublicHttpUrl('not a url')).toThrow(ValidationError);
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(ValidationError);
    expect(() => assertPublicHttpUrl('ftp://example.com/a.md')).toThrow(ValidationError);
  });

  it('rejects localhost and loopback', () => {
    expect(() => assertPublicHttpUrl('http://localhost:3001/secrets')).toThrow(ValidationError);
    expect(() => assertPublicHttpUrl('http://127.0.0.1/secrets')).toThrow(ValidationError);
  });

  it('rejects private network ranges and the cloud metadata address', () => {
    expect(() => assertPublicHttpUrl('http://10.0.0.5/')).toThrow(ValidationError);
    expect(() => assertPublicHttpUrl('http://192.168.1.1/')).toThrow(ValidationError);
    expect(() => assertPublicHttpUrl('http://172.16.0.1/')).toThrow(ValidationError);
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      ValidationError,
    );
  });
});

describe('SkillsService.parseImportFromUrl', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function service() {
    const repo = { getByName: async () => undefined } as unknown as SkillsRepository;
    const tokenizer = { count: (s: string) => s.length } as unknown as Tokenizer;
    return new SkillsService(repo, tokenizer);
  }

  it('fetches, parses, and returns a preview — nothing persisted', async () => {
    const body = '---\nname: remote-skill\ndescription: A skill fetched from a URL.\n---\n\n# Remote Skill\nBody text.';
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(body) };
            },
            cancel: async () => {},
          };
        },
      },
    })) as unknown as typeof fetch;

    const preview = await service().parseImportFromUrl('ws-1', 'https://example.com/skills/remote.md');
    expect(preview.name).toBe('remote-skill');
    expect(preview.description).toBe('A skill fetched from a URL.');
    expect(preview.body).toContain('Body text.');
    expect(preview.collides_with).toBeNull();
  });

  it('rejects a URL before ever calling fetch', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      service().parseImportFromUrl('ws-1', 'http://169.254.169.254/latest/meta-data'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a non-2xx response as a ValidationError, not a raw throw', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(
      service().parseImportFromUrl('ws-1', 'https://example.com/missing.md'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a redirect to a blocked host instead of following it', async () => {
    // A host that passes the initial SSRF check can still 302 to an internal
    // target — `redirect: 'manual'` + re-validating each hop is what closes
    // that bypass; this pins the behavior so it can't regress to `follow`.
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }),
    })) as unknown as typeof fetch;

    await expect(
      service().parseImportFromUrl('ws-1', 'https://example.com/redirects-to-metadata'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to another public host', async () => {
    const body = '---\nname: remote-skill\ndescription: A skill fetched from a URL.\n---\n\n# Remote Skill\nBody text.';
    const okResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(body) };
            },
            cancel: async () => {},
          };
        },
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'https://cdn.example.com/skills/remote.md' }),
      })
      .mockResolvedValueOnce(okResponse) as unknown as typeof fetch;

    const preview = await service().parseImportFromUrl('ws-1', 'https://example.com/skills/remote.md');
    expect(preview.name).toBe('remote-skill');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect chain longer than the allowed hop count', async () => {
    global.fetch = vi.fn(async (input: URL | string) => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: `${String(input)}/next` }),
    })) as unknown as typeof fetch;

    await expect(
      service().parseImportFromUrl('ws-1', 'https://example.com/loop'),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
