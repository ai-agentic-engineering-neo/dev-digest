import { isIP } from 'node:net';

/**
 * SSRF address classification for the URL fetcher. Pure — no DNS, no I/O.
 * `isBlockedIp` is true for anything that is not a plain public unicast address:
 * loopback, RFC1918 private, link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT (100.64/10), unspecified, multicast/reserved, and the IPv6 equivalents
 * (including IPv4-mapped `::ffff:a.b.c.d`, which would otherwise bypass the v4 checks).
 */

function parseIPv4(ip: string): [number, number, number, number] | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return undefined;
  return nums as [number, number, number, number];
}

function isBlockedIPv4(ip: string): boolean {
  const o = parseIPv4(ip);
  if (!o) return true; // unparsable => refuse
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** Expand an IPv6 literal to 8 hextets, or undefined if it isn't valid. */
function expandIPv6(ip: string): number[] | undefined {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4) -> two hextets.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return undefined;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return undefined;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? undefined : out;
}

function isBlockedIPv6(ip: string): boolean {
  const h = expandIPv6(ip);
  if (!h) return true;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h as [
    number, number, number, number, number, number, number, number,
  ];
  const allZeroTo5 = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;
  if (allZeroTo5 && h5 === 0 && h6 === 0 && (h7 === 0 || h7 === 1)) return true; // :: and ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d -> judge the embedded v4.
  if (allZeroTo5 && (h5 === 0xffff || h5 === 0)) {
    return isBlockedIPv4(`${h6 >> 8}.${h6 & 255}.${h7 >> 8}.${h7 & 255}`);
  }
  // NAT64 64:ff9b::/96 embeds a v4 in the last 32 bits.
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return isBlockedIPv4(`${h6 >> 8}.${h6 & 255}.${h7 >> 8}.${h7 & 255}`);
  }
  if ((h0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h0 & 0xffc0) === 0xfec0) return true; // deprecated site-local fec0::/10
  if ((h0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (h0 === 0x2001 && h1 === 0x0db8) return true; // documentation
  return false;
}

/** True when `ip` is NOT a public unicast address (or isn't a valid IP at all). */
export function isBlockedIp(ip: string): boolean {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  const family = isIP(bare);
  if (family === 4) return isBlockedIPv4(bare);
  if (family === 6) return isBlockedIPv6(bare);
  return true;
}

/** True when the URL hostname is an IP literal (bare or `[v6]`). */
export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return isIP(bare) !== 0;
}
