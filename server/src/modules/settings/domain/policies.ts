import type { ConnTestProvider, SecretKey } from '@devdigest/shared';

/** Provider id handled by the GitHub branch of the connection test. */
export const GITHUB_PROVIDER = 'github';

/** Maps a connection-test provider to the secret key it persists to. */
export const SECRET_KEY_BY_PROVIDER: Record<ConnTestProvider, SecretKey> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  github: 'GITHUB_TOKEN',
};

/** Provider SDK errors can echo the key back — never return it. */
export function redactKey(message: string, key: string | undefined): string {
  return key ? message.split(key).join('[redacted]') : message;
}
