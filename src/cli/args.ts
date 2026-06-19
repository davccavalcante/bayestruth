/**
 * A tiny, dependency-free argument parser for the BayesTruth CLI.
 *
 * Supports `--key value`, `--key=value`, boolean `--flag`, the `-h` and `-v` short aliases, and bare
 * positionals. The first positional is the command. No magic, no coercion beyond what each command
 * asks for, so behavior is obvious from the call site.
 *
 * @packageDocumentation
 */

/** The parsed shape of a CLI invocation. */
export interface ParsedArgs {
  readonly command: string | undefined;
  readonly positionals: ReadonlyArray<string>;
  readonly options: Readonly<Record<string, string | boolean>>;
}

/** Parse a raw argv tail (without the node and script entries) into a {@link ParsedArgs}. */
export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (token === '-h' || token === '--help') {
      options.help = true;
      continue;
    }
    if (token === '-v' || token === '--version') {
      options.version = true;
      continue;
    }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        options[body] = next;
        i += 1;
      } else {
        options[body] = true;
      }
      continue;
    }
    positionals.push(token);
  }

  return { command: positionals[0], positionals: positionals.slice(1), options };
}

/** Read a string option, returning `fallback` when absent or boolean. */
export function stringOption(
  options: Readonly<Record<string, string | boolean>>,
  key: string,
  fallback?: string,
): string | undefined {
  const value = options[key];
  return typeof value === 'string' ? value : fallback;
}

/** Read a numeric option, returning `fallback` when absent or unparseable. */
export function numberOption(
  options: Readonly<Record<string, string | boolean>>,
  key: string,
  fallback?: number,
): number | undefined {
  const value = options[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
