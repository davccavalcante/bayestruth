/**
 * BayesTruth CLI entry point (Node only).
 *
 * The single Node-targeted artifact: it binds the pure command logic in {@link runCli} to the real
 * filesystem and process streams, resolves its own version from the shipped package.json, and maps the
 * returned status to the process exit code. All trust math lives in the platform-neutral core; this
 * file only does the Node plumbing.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { type CliIo, runCli } from './commands.js';

function resolveVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const io: CliIo = {
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, data) => writeFile(path, data, 'utf8'),
  readStdin,
  out: (line) => {
    process.stdout.write(`${line}\n`);
  },
  err: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

process.exitCode = await runCli(process.argv.slice(2), io, { version: resolveVersion() });
