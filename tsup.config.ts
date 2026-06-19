import { defineConfig } from 'tsup';

/**
 * Build configuration for @takk/bayestruth.
 *
 * Eleven library entry points (dual ESM + CJS, each with its own .d.ts) plus the Node-only CLI
 * (ESM with shebang). Every library bundle is platform-neutral and pulls no Node built-in (the audit
 * seal uses the Web Crypto API, not node:crypto), so the whole Bayesian trust surface (beta math,
 * trust scoring, bandit selection, decay, store, policy, audit, interceptors, the MCP bridge, and
 * edge) is importable in browsers, edge runtimes, and embedded targets. The CLI is the only
 * Node-targeted artifact; it reads and writes trust store and audit files through node:fs.
 */
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'beta/index': 'src/beta/index.ts',
      'trust/index': 'src/trust/index.ts',
      'bandit/index': 'src/bandit/index.ts',
      'decay/index': 'src/decay/index.ts',
      'store/index': 'src/store/index.ts',
      'policy/index': 'src/policy/index.ts',
      'audit/index': 'src/audit/index.ts',
      'interceptors/index': 'src/interceptors/index.ts',
      'mcp/index': 'src/mcp/index.ts',
      'calibration/index': 'src/calibration/index.ts',
      'pool/index': 'src/pool/index.ts',
      'node/index': 'src/node/index.ts',
      'edge/index': 'src/edge/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    minify: false,
    target: 'es2022',
    platform: 'neutral',
    removeNodeProtocol: false,
    external: [/^node:/],
  },
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    splitting: false,
    minify: false,
    target: 'es2022',
    platform: 'node',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
