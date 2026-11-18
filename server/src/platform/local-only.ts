/**
 * S2 (plans/18-security-fixes.md) — guards for an API that has no
 * authentication and is meant to be reached only from this machine.
 *
 * Binding to 127.0.0.1 (see `config.apiHost`) keeps other hosts on the LAN
 * out. It does NOT stop a web page in the user's own browser: via DNS
 * rebinding, `attacker.tld` can resolve to 127.0.0.1, and the browser then
 * sends requests to this API with `Host: attacker.tld`. CORS does not help —
 * a "simple" cross-origin POST is still delivered, only its response is
 * hidden. So every request is also checked here:
 *
 *  - `Host` must name an allowed hostname (port ignored).
 *  - `Origin`, when present, must be an allowed web origin. Non-browser
 *    clients (curl, the MCP server, the pre-push CLI) send no Origin and pass.
 *
 * Pure functions — the hook itself is wired in `app.ts`.
 */

/** Hostname part of a `Host` header value, lowercased, without port or trailing dot. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const value = hostHeader.trim().toLowerCase();
  if (value.length === 0) return null;
  let host: string;
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end === -1) return null;
    host = value.slice(1, end);
  } else {
    host = value.split(':')[0] ?? '';
  }
  host = host.replace(/\.$/, '');
  return host.length > 0 ? host : null;
}

export function isAllowedHost(hostHeader: string | undefined, allowedHosts: readonly string[]): boolean {
  const host = hostnameOf(hostHeader);
  return host !== null && allowedHosts.includes(host);
}

/** True when there is no Origin (non-browser client) or it is one of ours. */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (origin === undefined) return true;
  return allowedOrigins.includes(origin.trim().toLowerCase().replace(/\/$/, ''));
}
