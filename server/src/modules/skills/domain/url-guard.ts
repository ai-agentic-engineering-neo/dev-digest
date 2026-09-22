/**
 * Pure SSRF rules for URL import (server/specs/03-skills.md Rules §8). The
 * infrastructure fetcher applies them to the URL and to EVERY address the host
 * resolves to, on every redirect hop.
 */
import { invalidImport } from './import.js';

/**
 * Validate a user-supplied import URL: `https:` only, port 443, no credentials.
 * A GitHub `blob` page is rewritten to its raw file. Throws `invalid_import`.
 */
export function parseImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalidImport('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw invalidImport('Only https:// URLs can be imported');
  if (url.port !== '' && url.port !== '443') throw invalidImport('Only the default https port (443) is allowed');
  if (url.username || url.password) throw invalidImport('URLs with credentials are not allowed');
  if (!url.hostname) throw invalidImport('The URL has no host');
  const host = bareHost(url.hostname);
  if (isIpLiteral(host) && !isPublicAddress(host)) {
    throw invalidImport(`${host} is not a public address`);
  }
  return rewriteGithubBlob(url);
}

/** `github.com/<o>/<r>/blob/<ref>/<path>` → `raw.githubusercontent.com/<o>/<r>/<ref>/<path>`. */
export function rewriteGithubBlob(url: URL): URL {
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return url;
  const m = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
  if (!m) return url;
  return new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
}

/** URL hostnames keep IPv6 literals in brackets (`[::1]`). */
export function bareHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

export function isIpLiteral(host: string): boolean {
  return parseIPv4(host) !== null || parseIPv6(host) !== null;
}

/**
 * True only for a globally routable unicast address. Loopback, private,
 * link-local, CGNAT, ULA, multicast, documentation/benchmark and reserved
 * ranges are all rejected, including IPv4 embedded in IPv6 (mapped, NAT64, 6to4).
 * An unparseable string is not public.
 */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isPublicV4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isPublicV6(v6);
  return false;
}

// ---- IPv4 ---------------------------------------------------------------------

function parseIPv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function isPublicV4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 100 && b! >= 64 && b! <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b! >= 16 && b! <= 31) return false; // private 172.16/12
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a! >= 224) return false; // multicast 224/4, reserved 240/4, broadcast
  return true;
}

// ---- IPv6 ---------------------------------------------------------------------

/** 8 hextets, or null. Accepts `::` compression, a trailing dotted IPv4 and a `%zone`. */
function parseIPv6(input: string): number[] | null {
  const s = input.split('%')[0]!;
  if (!s.includes(':')) return null;
  let head = s;
  const tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
    // Keep a `::` right before the IPv4 part; drop a single separating ':'.
    head = s.slice(0, lastColon + 1);
    if (!head.endsWith('::')) head = head.slice(0, -1);
  }
  const halves = head.split('::');
  if (halves.length > 2) return null;
  const toHextets = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const h of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      out.push(Number.parseInt(h, 16));
    }
    return out;
  };
  const left = toHextets(halves[0]!);
  const right = halves.length === 2 ? toHextets(halves[1]!) : [];
  if (!left || !right) return null;
  const explicit = left.length + right.length + tail.length;
  if (halves.length === 2) {
    if (explicit > 7) return null;
    return [...left, ...new Array(8 - explicit).fill(0), ...right, ...tail];
  }
  return explicit === 8 ? [...left, ...tail] : null;
}

function embeddedV4(h: number[], from: number): number[] {
  return [h[from]! >> 8, h[from]! & 0xff, h[from + 1]! >> 8, h[from + 1]! & 0xff];
}

function isPublicV6(h: number[]): boolean {
  const zeroPrefix = (n: number) => h.slice(0, n).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) → judge the IPv4 address.
  if (zeroPrefix(5) && h[5] === 0xffff) return isPublicV4(embeddedV4(h, 6));
  // 64:ff9b::/96 (NAT64) → judge the IPv4 address.
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) {
    return isPublicV4(embeddedV4(h, 6));
  }
  // 2002::/16 (6to4) → the IPv4 is in hextets 1-2.
  if (h[0] === 0x2002) return isPublicV4(embeddedV4(h, 1));
  // Global unicast is 2000::/3; everything else (::, ::1, ULA fc00::/7,
  // link-local fe80::/10, multicast ff00::/8, IPv4-compatible) is not public.
  if ((h[0]! & 0xe000) !== 0x2000) return false;
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (h[0] === 0x2001 && h[1] === 0) return false; // Teredo (obfuscated IPv4)
  return true;
}
