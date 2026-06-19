/**
 * Distribution smoke test for @takk/bayestruth.
 *
 * Exercises the compiled artifacts the way a real consumer would: the ESM and CJS root bundles, a
 * representative set of subpath entry points, and the compiled CLI spawned as a single Node process
 * (never through a tsx wrapper, so exit codes are the CLI's own). Run after `build` and before publish.
 * Any failed assertion exits non-zero so the verify gate stops the release.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(here, '..', 'dist');
const cliPath = join(distDir, 'cli', 'index.js');
const require = createRequire(import.meta.url);

let passed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      process.stdout.write(`ok ${label}\n`);
    })
    .catch((error) => {
      process.stderr.write(`FAIL ${label}: ${error?.message ?? error}\n`);
      process.exitCode = 1;
      throw error;
    });
}

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} near ${expected}`);
}

function runCli(args, input) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    input: input ?? '',
    encoding: 'utf8',
  });
}

const esm = await import(join(distDir, 'index.js'));

await check('esm root exports the facade and priors', () => {
  assert.equal(typeof esm.createBayesTruth, 'function');
  assert.deepEqual(esm.UNIFORM_PRIOR, { alpha: 1, beta: 1 });
  assert.deepEqual(esm.JEFFREYS_PRIOR, { alpha: 0.5, beta: 0.5 });
});

await check('beta mean and cdf are exact on the uniform prior', () => {
  approx(esm.betaMean({ alpha: 1, beta: 1 }), 0.5);
  approx(esm.betaCdf(0.5, { alpha: 1, beta: 1 }), 0.5, 1e-9);
  approx(esm.betaMean({ alpha: 9, beta: 1 }), 0.9);
});

await check('conjugate updates move the posterior mean and bound the interval', () => {
  const trust = esm.createBayesTruth();
  trust.observeMany('search-api', 9, 1);
  const score = trust.score('search-api');
  approx(score.score, 10 / 12, 1e-12);
  assert.ok(score.interval.lower < score.score && score.score < score.interval.upper);
  assert.equal(score.samples, 10);
});

await check('credible interval respects the configured level', () => {
  const trust = esm.createBayesTruth({ level: 0.5 });
  trust.observeMany('a', 5, 5);
  const narrow = trust.score('a').interval;
  assert.equal(narrow.level, 0.5);
  const wide = esm.credibleInterval({ alpha: 6, beta: 6 }, 0.99);
  assert.ok(wide.upper - wide.lower > narrow.upper - narrow.lower);
});

await check('decay pulls evidence back toward the prior', () => {
  const clock = esm.createDeterministicClock(0, 1000);
  const trust = esm.createBayesTruth({ clock, decay: { halfLifeMs: 1000 } });
  trust.observeMany('flaky', 10, 0);
  const before = trust.score('flaky').score;
  for (let i = 0; i < 50; i += 1) {
    clock();
  }
  const after = trust.score('flaky').score;
  assert.ok(after < before, `expected decay to lower trust, ${after} < ${before}`);
});

await check('thompson selection returns one of the known subjects', () => {
  const trust = esm.createBayesTruth({ seed: 7 });
  trust.observeMany('strong', 40, 2);
  trust.observeMany('weak', 2, 40);
  const choice = trust.select();
  assert.ok(['strong', 'weak'].includes(choice.subject));
  assert.equal(typeof choice.draws.strong, 'number');
});

await check('store snapshot round-trips through encode and load', () => {
  const trust = esm.createBayesTruth();
  trust.observeMany('a', 3, 1);
  const json = esm.encodeStore(esm.createMemoryStore(trust.snapshot()));
  const restored = esm.createBayesTruth({ store: esm.loadStore(json) });
  approx(restored.score('a').score, trust.score('a').score, 1e-12);
});

await check('default policy keeps small samples under monitor', () => {
  const trust = esm.createBayesTruth();
  trust.observe('fresh', 'success');
  assert.equal(trust.decide('fresh'), 'monitor');
  trust.observeMany('proven', 200, 1);
  assert.equal(trust.decide('proven'), 'trust');
});

await check('audit log seals and verifies, and tampering is detected', async () => {
  const trust = esm.createBayesTruth({ audit: true, clock: esm.createDeterministicClock(1) });
  trust.observe('x', 'success');
  trust.observe('x', 'failure');
  trust.decide('x');
  const seal = await trust.seal();
  const ok = await trust.verify(seal);
  assert.equal(ok.valid, true);
  const log = trust.auditLog();
  const tampered = {
    id: log.id,
    entries: log.entries.map((entry, index) =>
      index === 0 ? { ...entry, summary: 'forged' } : entry,
    ),
  };
  const bad = await esm.verifyAuditLog(tampered, seal);
  assert.equal(bad.valid, false);
});

await check('mcp interception scores tool results by isError', async () => {
  const trust = esm.createBayesTruth();
  const mcp = await import(join(distDir, 'mcp', 'index.js'));
  const client = {
    callTool: async ({ name }) => ({ isError: name === 'broken', content: name }),
  };
  const wrapped = mcp.interceptMcpClient(client, { sink: trust.sink });
  await wrapped.callTool({ name: 'good' });
  await wrapped.callTool({ name: 'good' });
  await wrapped.callTool({ name: 'broken' });
  assert.equal(trust.score('mcp:good').successes, 2);
  assert.equal(trust.score('mcp:broken').failures, 1);
});

await check('correlated-failure guard collapses a burst into one event', () => {
  const clock = esm.createDeterministicClock(0, 10);
  const trust = esm.createBayesTruth({ clock, coalesce: { windowMs: 100 } });
  trust.observe('outage', 'failure');
  trust.observe('outage', 'failure');
  trust.observe('outage', 'failure');
  assert.equal(trust.score('outage').samples, 1);
});

await check('calibration diagnostics are exact on perfect predictions', () => {
  const predictions = [
    { p: 1, outcome: 'success' },
    { p: 0, outcome: 'failure' },
  ];
  approx(esm.brierScore(predictions), 0, 1e-12);
  assert.ok(esm.expectedCalibrationError(predictions, 10) < 1e-9);
  assert.equal(esm.calibrationReport(predictions).count, 2);
});

await check('empirical-Bayes pooling shrinks a sparse subject toward its group', () => {
  const group = [
    esm.createBayesTruth(),
    esm.createBayesTruth(),
    esm.createBayesTruth(),
  ].map((t, i) => {
    t.observeMany('s', [90, 88, 92][i], [10, 12, 8][i]);
    return t.snapshot().subjects[0];
  });
  const prior = esm.fitCategoryPrior(group);
  esm.assertPosterior(prior);
  const sparse = esm.createBayesTruth();
  sparse.observeMany('fresh', 1, 1);
  const pooled = esm.pooledScore(sparse.snapshot().subjects[0], prior).score;
  assert.ok(pooled > 0.5 && pooled < esm.betaMean(prior));
});

await check('node file store persists and reloads atomically', async () => {
  const nodeStore = await import(join(distDir, 'node', 'index.js'));
  const dir = mkdtempSync(join(tmpdir(), 'bayestruth-fs-'));
  const file = join(dir, 'trust.json');
  const trust = esm.createBayesTruth({ store: nodeStore.createFileStore(file) });
  trust.observeMany('api', 3, 1);
  const reopened = esm.createBayesTruth({ store: nodeStore.createFileStore(file) });
  approx(reopened.score('api').score, trust.score('api').score, 1e-12);
});

await check('representative subpath entry points resolve', async () => {
  const beta = await import(join(distDir, 'beta', 'index.js'));
  const trust = await import(join(distDir, 'trust', 'index.js'));
  const calibration = await import(join(distDir, 'calibration', 'index.js'));
  const pool = await import(join(distDir, 'pool', 'index.js'));
  const edge = await import(join(distDir, 'edge', 'index.js'));
  approx(beta.betaMean({ alpha: 2, beta: 2 }), 0.5);
  assert.equal(typeof trust.scoreRecord, 'function');
  assert.equal(typeof calibration.brierScore, 'function');
  assert.equal(typeof pool.fitCategoryPrior, 'function');
  assert.equal(typeof edge.createBayesTruth, 'function');
});

await check('cjs root bundle is requireable', () => {
  const cjs = require(join(distDir, 'index.cjs'));
  assert.equal(typeof cjs.createBayesTruth, 'function');
  approx(cjs.betaMean({ alpha: 3, beta: 1 }), 0.75);
});

await check('cli prints its version', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

await check('cli help is the default and exits zero', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

await check('cli scores a subject from a piped store', () => {
  const seed = esm.createBayesTruth();
  seed.observeMany('api', 8, 2);
  const snapshot = JSON.stringify(seed.snapshot());
  const result = runCli(['score', 'api'], snapshot);
  assert.equal(result.status, 0);
  const score = JSON.parse(result.stdout);
  approx(score.score, 9 / 12, 1e-9);
});

await check('cli observe writes the updated store back to a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bayestruth-'));
  const file = join(dir, 'store.json');
  const seed = esm.createBayesTruth();
  seed.observeMany('api', 1, 0);
  writeFileSync(file, JSON.stringify(seed.snapshot()), 'utf8');
  const result = runCli(['observe', 'api', 'success', '--store', file]);
  assert.equal(result.status, 0);
  const persisted = JSON.parse(readFileSync(file, 'utf8'));
  const record = persisted.subjects.find((entry) => entry.subject === 'api');
  assert.equal(record.successes, 2);
});

await check('cli verifies an audit log and rejects a tampered one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bayestruth-audit-'));
  const logFile = join(dir, 'log.json');
  const sealFile = join(dir, 'seal.json');
  const trust = esm.createBayesTruth({ audit: true, clock: esm.createDeterministicClock(1) });
  trust.observe('x', 'success');
  const seal = await trust.seal();
  writeFileSync(logFile, JSON.stringify(trust.auditLog()), 'utf8');
  writeFileSync(sealFile, JSON.stringify(seal), 'utf8');
  assert.equal(runCli(['verify', '--log', logFile, '--seal', sealFile]).status, 0);

  const tampered = JSON.parse(readFileSync(logFile, 'utf8'));
  tampered.entries[0].summary = 'forged';
  writeFileSync(logFile, JSON.stringify(tampered), 'utf8');
  assert.equal(runCli(['verify', '--log', logFile, '--seal', sealFile]).status, 65);
});

await check('cli rejects an unknown command with a usage code', () => {
  const result = runCli(['frobnicate']);
  assert.equal(result.status, 64);
});

process.stdout.write(`\n${passed} checks passed\n`);
