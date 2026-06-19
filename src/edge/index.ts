/**
 * Edge entry point.
 *
 * The entire BayesTruth core is node-free: the math is pure JavaScript and the audit chain uses the
 * Web Crypto API, not node:crypto. This module re-exports that core verbatim so edge runtimes
 * (Cloudflare Workers, Vercel Edge, Deno, the browser) can import a path that advertises its
 * portability. There is no separate implementation; the guarantee is that nothing reachable from here
 * touches a Node built-in.
 *
 * @packageDocumentation
 */

export * from '../index.js';
