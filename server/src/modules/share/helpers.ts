import { createHash } from 'node:crypto';

/**
 * F7 — digest sharing pure helpers. No I/O, no DB, no container — token
 * minting, password fingerprinting, and inline-expression rendering for the
 * digest template engine.
 */

/**
 * Mint a short, URL-safe token for a public share link. Kept short so it fits
 * cleanly in a "copy link" affordance and a QR code.
 */
export function generateShareToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * Fingerprint an optional share password so we never store the plaintext.
 * Compared against the stored fingerprint when a visitor unlocks the link.
 */
export function hashSharePassword(password: string): string {
  return createHash('md5').update(password).digest('hex');
}

/**
 * Digest templates support inline expressions — `{{ repo.stars * 2 }}`,
 * `{{ findings.length }}` — so authors can compute small summary values
 * directly in the markdown. We resolve each `{{ ... }}` against the supplied
 * scope and substitute the result back into the body.
 */
export function renderTemplate(body: string, scope: Record<string, unknown>): string {
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  return body.replace(/\{\{(.+?)\}\}/g, (_m, expr: string) => {
    const fn = new Function(...keys, `return (${expr});`);
    return String(fn(...values));
  });
}

/** Build the canonical public URL for a share token. */
export function shareUrl(origin: string, token: string): string {
  return `${origin}/share/${token}`;
}
