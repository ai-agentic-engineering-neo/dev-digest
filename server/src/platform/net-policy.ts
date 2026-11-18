import { BlockList, isIP } from 'node:net';

/**
 * S7 (plans/18-security-fixes.md) — addresses a server-side fetch of a
 * user-supplied URL must never reach: loopback, private networks, link-local
 * (incl. cloud metadata 169.254.169.254), CGNAT, multicast/reserved, and the
 * IPv6 equivalents. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is blocked as a whole
 * — it is how `[::ffff:127.0.0.1]` slipped past the old regex deny-list.
 *
 * Pure (no I/O). Used for IP literals at validation time and for every
 * resolved address at connect time (adapters/http/safe-fetch.ts).
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  // NOT `::ffff:0:0/96`: Node's BlockList maps every IPv4 address into that
  // range, so the rule would block all of IPv4. Mapped addresses are unwrapped
  // and checked against the IPv4 rules in isBlockedAddress instead.
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True when `ip` must not be fetched. Anything that isn't an IP literal is refused too. */
export function isBlockedAddress(ip: string): boolean {
  const literal = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  const family = isIP(literal);
  if (family === 4) return blocked.check(literal, 'ipv4');
  if (family === 6) {
    const mapped = unwrapMappedIpv4(literal);
    if (mapped) return blocked.check(mapped, 'ipv4');
    return blocked.check(literal, 'ipv6');
  }
  return true;
}

/**
 * `::ffff:127.0.0.1` / `::ffff:7f00:1` (any case, any zero-compression of the
 * prefix) → `127.0.0.1`; anything else → null.
 */
function unwrapMappedIpv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  const m = lower.match(/^(?:0{0,4}:){0,5}:?ffff:(.+)$/);
  if (!m?.[1]) return null;
  const tail = m[1];
  if (isIP(tail) === 4) return tail;
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/** True when `hostname` (as `URL.hostname` gives it) is an IPv4/IPv6 literal. */
export function isIpLiteral(hostname: string): boolean {
  const literal = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return isIP(literal) !== 0;
}
