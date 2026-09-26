import ipaddr from 'ipaddr.js';

/** IPv6 global unicast block; anything outside it is not routable on the public internet. */
const GLOBAL_UNICAST_V6 = ipaddr.parseCIDR('2000::/3');

/**
 * SSRF address policy: true only for a public, globally routable unicast address.
 * Fail-closed — anything unparseable or in a special-purpose range (private, loopback,
 * link-local incl. the 169.254.169.254 metadata address, CGNAT 100.64/10, ULA fc00::/7,
 * multicast, unspecified, reserved, benchmarking, ...) is rejected. An IPv4-mapped IPv6
 * address (`::ffff:a.b.c.d`) is unwrapped and classified as the IPv4 address it carries.
 */
export function isPublicUnicast(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.process(ip);
  } catch {
    return false;
  }
  if (addr.range() !== 'unicast') return false;
  if (addr.kind() === 'ipv6') return addr.match(GLOBAL_UNICAST_V6);
  return true;
}
