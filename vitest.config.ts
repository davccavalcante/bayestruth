import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI command logic (src/cli/commands.ts) is unit-tested in-process via runCli in
      // tests/cli.test.ts, so it is covered. Only the bin (src/cli/index.ts), which wires the real
      // process streams and exit code at module load, cannot be exercised in-process; exclude it.
      exclude: ['src/cli/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 60,
      },
    },
  },
});
