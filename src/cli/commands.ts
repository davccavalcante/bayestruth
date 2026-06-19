/**
 * BayesTruth CLI commands.
 *
 * Pure command logic over an injected {@link CliIo}, so every command is testable without touching the
 * filesystem or the process. The CLI reads a portable store snapshot (from a file or stdin), answers
 * trust questions against it, folds new observations back into it, and verifies audit seals. It is the
 * operational surface for inspecting and curating trust outside a running process.
 *
 * @packageDocumentation
 */

import {
  type AuditLog,
  type AuditSeal,
  createBayesTruth,
  encodeStore,
  isBayesTruthError,
  loadStore,
  type Outcome,
  type RankBy,
  verifyAuditLog,
} from '../index.js';
import { numberOption, type ParsedArgs, parseArgs, stringOption } from './args.js';

/** Standard sysexits-style exit codes. */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 64,
  DATAERR: 65,
  NOINPUT: 66,
} as const;

/** The injected input and output surface for the CLI. */
export interface CliIo {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  readStdin(): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

/** Static metadata the CLI reports, resolved from package.json by the entry point. */
export interface CliMeta {
  readonly version: string;
}

const HELP = `bayestruth, exact Bayesian trust scoring for tools, MCP servers, skills, and agents.

Usage:
  bayestruth <command> [options]

Commands:
  score <subject>     Print the trust score for one subject.
  rank                Print every subject ranked best-first.
  inspect <subject>   Print the full posterior and counts for one subject.
  observe <subject> <success|failure>
                      Fold one outcome into the store and write it back.
  verify              Verify an audit log against a seal.
  help                Print this help.

Options:
  --store <file>      Trust store snapshot JSON. Reads stdin when omitted.
  --out <file>        Where 'observe' writes the updated store. Defaults to --store.
  --level <n>         Credible-interval level in (0, 1). Default 0.95.
  --by <mean|lower>   Ranking key for 'rank'. Default lower (conservative).
  --log <file>        Audit log JSON for 'verify'.
  --seal <file>       Audit seal JSON for 'verify'.
  -h, --help          Print this help.
  -v, --version       Print the version.

Exit codes: 0 ok, 1 error, 64 usage, 65 data error, 66 missing input.`;

async function loadSnapshotJson(parsed: ParsedArgs, io: CliIo): Promise<string> {
  const file = stringOption(parsed.options, 'store');
  if (file) {
    return io.readFile(file);
  }
  return io.readStdin();
}

async function commandScore(parsed: ParsedArgs, io: CliIo): Promise<number> {
  const subject = parsed.positionals[0];
  if (!subject) {
    io.err('score requires a subject');
    return EXIT.USAGE;
  }
  const level = numberOption(parsed.options, 'level');
  const json = await loadSnapshotJson(parsed, io);
  const trust = createBayesTruth({
    store: loadStore(json),
    ...(level !== undefined ? { level } : {}),
  });
  io.out(JSON.stringify(trust.score(subject), null, 2));
  return EXIT.OK;
}

async function commandRank(parsed: ParsedArgs, io: CliIo): Promise<number> {
  const by = stringOption(parsed.options, 'by') as RankBy | undefined;
  if (by !== undefined && by !== 'mean' && by !== 'lower') {
    io.err(`--by must be 'mean' or 'lower'`);
    return EXIT.USAGE;
  }
  const json = await loadSnapshotJson(parsed, io);
  const trust = createBayesTruth({ store: loadStore(json) });
  const ranked = trust.rank(by).map((score) => ({
    subject: score.subject,
    score: score.score,
    lower: score.interval.lower,
    upper: score.interval.upper,
    samples: score.samples,
  }));
  io.out(JSON.stringify(ranked, null, 2));
  return EXIT.OK;
}

async function commandInspect(parsed: ParsedArgs, io: CliIo): Promise<number> {
  const subject = parsed.positionals[0];
  if (!subject) {
    io.err('inspect requires a subject');
    return EXIT.USAGE;
  }
  const json = await loadSnapshotJson(parsed, io);
  const trust = createBayesTruth({ store: loadStore(json) });
  io.out(JSON.stringify(trust.record(subject), null, 2));
  return EXIT.OK;
}

async function commandObserve(parsed: ParsedArgs, io: CliIo): Promise<number> {
  const subject = parsed.positionals[0];
  const outcome = parsed.positionals[1];
  if (!subject || (outcome !== 'success' && outcome !== 'failure')) {
    io.err('observe requires <subject> <success|failure>');
    return EXIT.USAGE;
  }
  const storeFile = stringOption(parsed.options, 'store');
  const outFile = stringOption(parsed.options, 'out', storeFile);
  if (!outFile) {
    io.err('observe requires --store or --out to write the updated store');
    return EXIT.USAGE;
  }
  const json = await loadSnapshotJson(parsed, io);
  const store = loadStore(json);
  const trust = createBayesTruth({ store });
  trust.observe(subject, outcome as Outcome);
  await io.writeFile(outFile, encodeStore(store));
  io.out(JSON.stringify(trust.score(subject), null, 2));
  return EXIT.OK;
}

async function commandVerify(parsed: ParsedArgs, io: CliIo): Promise<number> {
  const logFile = stringOption(parsed.options, 'log');
  const sealFile = stringOption(parsed.options, 'seal');
  if (!logFile || !sealFile) {
    io.err('verify requires --log and --seal');
    return EXIT.USAGE;
  }
  const log = JSON.parse(await io.readFile(logFile)) as AuditLog;
  const seal = JSON.parse(await io.readFile(sealFile)) as AuditSeal;
  const result = await verifyAuditLog(log, seal);
  io.out(JSON.stringify(result, null, 2));
  return result.valid ? EXIT.OK : EXIT.DATAERR;
}

/** Run the CLI against an injected IO surface, returning the process exit code. */
export async function runCli(
  argv: ReadonlyArray<string>,
  io: CliIo,
  meta: CliMeta,
): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.options.version) {
    io.out(meta.version);
    return EXIT.OK;
  }
  if (parsed.options.help || parsed.command === 'help' || parsed.command === undefined) {
    io.out(HELP);
    return EXIT.OK;
  }

  try {
    switch (parsed.command) {
      case 'score':
        return await commandScore(parsed, io);
      case 'rank':
        return await commandRank(parsed, io);
      case 'inspect':
        return await commandInspect(parsed, io);
      case 'observe':
        return await commandObserve(parsed, io);
      case 'verify':
        return await commandVerify(parsed, io);
      default:
        io.err(`unknown command "${parsed.command}". Run 'bayestruth help'.`);
        return EXIT.USAGE;
    }
  } catch (error) {
    return handleError(error, io);
  }
}

function handleError(error: unknown, io: CliIo): number {
  if (isBayesTruthError(error)) {
    io.err(`${error.code}: ${error.message}`);
    return error.code === 'ERR_INVALID_INPUT' || error.code === 'ERR_INVALID_AUDIT'
      ? EXIT.DATAERR
      : EXIT.ERROR;
  }
  if (error instanceof SyntaxError) {
    io.err(`invalid JSON: ${error.message}`);
    return EXIT.DATAERR;
  }
  const nodeError = error as { code?: string; message?: string };
  if (nodeError?.code === 'ENOENT') {
    io.err(`file not found: ${nodeError.message ?? 'unknown path'}`);
    return EXIT.NOINPUT;
  }
  io.err(error instanceof Error ? error.message : String(error));
  return EXIT.ERROR;
}
