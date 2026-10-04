import { z } from 'zod';

// Ring 4. The only place that reads process.env. The base URL comes from the
// environment only (never from tool arguments) and must be http(s).

const HttpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: 'must start with http:// or https://' });

const EnvSchema = z.object({
  DEVDIGEST_API_URL: HttpUrl.default('http://127.0.0.1:3001'),
  // Hard ceiling is 120 s (decision D2): the value may only be lowered.
  DEVDIGEST_RUN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(120_000),
  DEVDIGEST_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
});

export interface Config {
  /** API base URL without a trailing slash. */
  apiBaseUrl: string;
  runTimeoutMs: number;
  httpTimeoutMs: number;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; message: string };

/** Pure: parses an env-like record. Treats empty strings as unset. */
export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const cleaned: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const v = env[key];
    cleaned[key] = v === undefined || v.trim() === '' ? undefined : v.trim();
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    return { ok: false, message: `Invalid devdigest-mcp environment — ${detail}` };
  }
  const d = parsed.data;
  return {
    ok: true,
    config: {
      apiBaseUrl: d.DEVDIGEST_API_URL.replace(/\/+$/, ''),
      runTimeoutMs: d.DEVDIGEST_RUN_TIMEOUT_MS,
      httpTimeoutMs: d.DEVDIGEST_HTTP_TIMEOUT_MS,
    },
  };
}
