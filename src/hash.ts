/**
 * cyrb53, a small, fast, non-cryptographic 53-bit string hash.
 *
 * Used only to derive short, stable, content-addressed identifiers (audit log ids) deterministically
 * from their content. It is NOT used for tamper evidence, that is the audit seal's job, which uses
 * SHA-256 via the Web Crypto API. Pure JavaScript, no dependency, runs everywhere.
 *
 * @packageDocumentation
 */

/** Compute a stable 53-bit hash of `input` as a zero-padded 14-character lowercase hex string. */
export function cyrb53(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const high = h2 >>> 0;
  const low = h1 >>> 0;
  return (high.toString(16).padStart(6, '0') + low.toString(16).padStart(8, '0')).slice(0, 14);
}
