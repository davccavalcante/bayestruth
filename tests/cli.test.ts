import { describe, expect, it } from 'vitest';
import { type CliIo, EXIT, runCli } from '../src/cli/commands.js';
import { createBayesTruth } from '../src/index.js';
import { createDeterministicClock } from '../src/interceptors/index.js';

const META = { version: '1.0.0' };

function makeIo(files: Record<string, string> = {}, stdin = '') {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    readFile: async (path) => {
      if (!(path in files)) {
        const error = new Error(`ENOENT: no such file ${path}`) as Error & { code?: string };
        error.code = 'ENOENT';
        throw error;
      }
      return files[path] as string;
    },
    writeFile: async (path, data) => {
      files[path] = data;
    },
    readStdin: async () => stdin,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { io, out, err, files };
}

function snapshotJson(): string {
  const trust = createBayesTruth();
  trust.observeMany('api', 8, 2);
  trust.observeMany('flaky', 1, 9);
  return JSON.stringify(trust.snapshot());
}

describe('help and version', () => {
  it('prints help when no command is given', async () => {
    const { io, out } = makeIo();
    expect(await runCli([], io, META)).toBe(EXIT.OK);
    expect(out.join('\n')).toMatch(/Usage:/);
  });

  it('prints help for the help command and the --help flag', async () => {
    const { io, out } = makeIo();
    expect(await runCli(['help'], io, META)).toBe(EXIT.OK);
    expect(await runCli(['score', '--help'], io, META)).toBe(EXIT.OK);
    expect(out.join('\n')).toMatch(/Commands:/);
  });

  it('prints the version', async () => {
    const { io, out } = makeIo();
    expect(await runCli(['--version'], io, META)).toBe(EXIT.OK);
    expect(out).toContain('1.0.0');
  });
});

describe('score', () => {
  it('scores a subject from piped stdin', async () => {
    const { io, out } = makeIo({}, snapshotJson());
    expect(await runCli(['score', 'api'], io, META)).toBe(EXIT.OK);
    expect(JSON.parse(out[0] as string).score).toBeCloseTo(9 / 12, 9);
  });

  it('scores from a store file with a custom level', async () => {
    const { io, out } = makeIo({ 'store.json': snapshotJson() });
    expect(
      await runCli(['score', 'api', '--store', 'store.json', '--level', '0.5'], io, META),
    ).toBe(EXIT.OK);
    expect(JSON.parse(out[0] as string).interval.level).toBe(0.5);
  });

  it('rejects a missing subject', async () => {
    const { io } = makeIo({}, snapshotJson());
    expect(await runCli(['score'], io, META)).toBe(EXIT.USAGE);
  });
});

describe('rank', () => {
  it('ranks subjects best-first', async () => {
    const { io, out } = makeIo({}, snapshotJson());
    expect(await runCli(['rank'], io, META)).toBe(EXIT.OK);
    expect(JSON.parse(out[0] as string)[0].subject).toBe('api');
  });

  it('accepts an explicit ranking key', async () => {
    const { io } = makeIo({}, snapshotJson());
    expect(await runCli(['rank', '--by', 'mean'], io, META)).toBe(EXIT.OK);
  });

  it('rejects an invalid ranking key', async () => {
    const { io } = makeIo({}, snapshotJson());
    expect(await runCli(['rank', '--by', 'sideways'], io, META)).toBe(EXIT.USAGE);
  });
});

describe('inspect', () => {
  it('prints the full record', async () => {
    const { io, out } = makeIo({}, snapshotJson());
    expect(await runCli(['inspect', 'api'], io, META)).toBe(EXIT.OK);
    expect(JSON.parse(out[0] as string).posterior.alpha).toBe(9);
  });

  it('rejects a missing subject', async () => {
    const { io } = makeIo({}, snapshotJson());
    expect(await runCli(['inspect'], io, META)).toBe(EXIT.USAGE);
  });
});

describe('observe', () => {
  it('folds an outcome and writes the store back', async () => {
    const { io, out, files } = makeIo({ 'store.json': snapshotJson() });
    expect(await runCli(['observe', 'api', 'success', '--store', 'store.json'], io, META)).toBe(
      EXIT.OK,
    );
    const persisted = JSON.parse(files['store.json'] as string);
    const record = persisted.subjects.find((entry: { subject: string }) => entry.subject === 'api');
    expect(record.successes).toBe(9);
    expect(JSON.parse(out[0] as string).subject).toBe('api');
  });

  it('rejects an invalid outcome', async () => {
    const { io } = makeIo({ 'store.json': snapshotJson() });
    expect(await runCli(['observe', 'api', 'maybe', '--store', 'store.json'], io, META)).toBe(
      EXIT.USAGE,
    );
  });

  it('requires somewhere to write', async () => {
    const { io } = makeIo({}, snapshotJson());
    expect(await runCli(['observe', 'api', 'success'], io, META)).toBe(EXIT.USAGE);
  });
});

describe('verify', () => {
  async function auditFiles() {
    const trust = createBayesTruth({ audit: true, clock: createDeterministicClock(1) });
    trust.observe('x', 'success');
    trust.observe('x', 'failure');
    const seal = await trust.seal();
    return {
      'log.json': JSON.stringify(trust.auditLog()),
      'seal.json': JSON.stringify(seal),
    };
  }

  it('verifies a valid log', async () => {
    const { io } = makeIo(await auditFiles());
    expect(await runCli(['verify', '--log', 'log.json', '--seal', 'seal.json'], io, META)).toBe(
      EXIT.OK,
    );
  });

  it('rejects a tampered log with a data error', async () => {
    const files = await auditFiles();
    const tampered = JSON.parse(files['log.json'] as string);
    tampered.entries[0].summary = 'forged';
    files['log.json'] = JSON.stringify(tampered);
    const { io } = makeIo(files);
    expect(await runCli(['verify', '--log', 'log.json', '--seal', 'seal.json'], io, META)).toBe(
      EXIT.DATAERR,
    );
  });

  it('requires both log and seal', async () => {
    const { io } = makeIo();
    expect(await runCli(['verify', '--log', 'log.json'], io, META)).toBe(EXIT.USAGE);
  });
});

describe('error handling', () => {
  it('rejects an unknown command', async () => {
    const { io } = makeIo();
    expect(await runCli(['frobnicate'], io, META)).toBe(EXIT.USAGE);
  });

  it('maps invalid store JSON to a data error', async () => {
    const { io } = makeIo({}, 'not json at all');
    expect(await runCli(['score', 'api'], io, META)).toBe(EXIT.DATAERR);
  });

  it('maps a missing file to a no-input error', async () => {
    const { io } = makeIo();
    expect(await runCli(['score', 'api', '--store', 'absent.json'], io, META)).toBe(EXIT.NOINPUT);
  });
});
