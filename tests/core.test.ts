import { describe, expect, it } from 'vitest';
import { createBayesTruth, createMemoryStore, JEFFREYS_PRIOR } from '../src/index.js';
import { createDeterministicClock } from '../src/interceptors/index.js';

describe('createBayesTruth observation and scoring', () => {
  it('folds outcomes into a calibrated score', () => {
    const trust = createBayesTruth();
    trust.observe('a', 'success');
    trust.observe('a', false);
    const score = trust.score('a');
    expect(score.samples).toBe(2);
    expect(score.score).toBeCloseTo(0.5, 12);
  });

  it('observeMany folds batches, including the empty batch', () => {
    const trust = createBayesTruth();
    const record = trust.observeMany('a', 3, 1);
    expect(record.successes).toBe(3);
    expect(record.failures).toBe(1);
    const untouched = trust.observeMany('b', 0, 0);
    expect(untouched.successes).toBe(0);
    expect(trust.subjects()).toEqual(['a']);
  });

  it('creates a fresh record from a custom prior for unseen subjects', () => {
    const trust = createBayesTruth({ prior: JEFFREYS_PRIOR });
    expect(trust.record('new').posterior).toEqual({ alpha: 0.5, beta: 0.5 });
    expect(trust.posterior('new')).toEqual({ alpha: 0.5, beta: 0.5 });
  });

  it('exposes the interval at the default and an overridden level', () => {
    const trust = createBayesTruth();
    trust.observeMany('a', 5, 5);
    expect(trust.interval('a').level).toBe(0.95);
    expect(trust.interval('a', 0.5).level).toBe(0.5);
  });

  it('honors a configured credible level', () => {
    const trust = createBayesTruth({ level: 0.8 });
    trust.observeMany('a', 5, 5);
    expect(trust.score('a').interval.level).toBe(0.8);
  });
});

describe('decisions, ranking, and selection', () => {
  it('scoreAll and rank cover every known subject', () => {
    const trust = createBayesTruth();
    trust.observeMany('good', 50, 1);
    trust.observeMany('bad', 1, 50);
    expect(
      trust
        .scoreAll()
        .map((s) => s.subject)
        .sort(),
    ).toEqual(['bad', 'good']);
    expect(trust.rank()[0]?.subject).toBe('good');
    expect(trust.rank('mean')[0]?.subject).toBe('good');
  });

  it('decides under the configured and an overriding policy', () => {
    const trust = createBayesTruth();
    trust.observeMany('proven', 200, 1);
    expect(trust.decide('proven')).toBe('trust');
    expect(trust.decide('proven', { trustLower: 0.999, distrustMean: 0.5, minSamples: 5 })).toBe(
      'monitor',
    );
  });

  it('selects across all subjects and an explicit subset', () => {
    const trust = createBayesTruth({ seed: 3 });
    trust.observeMany('a', 30, 1);
    trust.observeMany('b', 1, 30);
    expect(['a', 'b']).toContain(trust.select().subject);
    expect(trust.select(['a']).subject).toBe('a');
  });
});

describe('persistence', () => {
  it('snapshots and reloads from a snapshot object and a JSON string', () => {
    const trust = createBayesTruth();
    trust.observeMany('a', 4, 2);
    const snapshot = trust.snapshot();

    const viaObject = createBayesTruth();
    viaObject.load(snapshot);
    expect(viaObject.score('a').score).toBeCloseTo(trust.score('a').score, 12);

    const viaJson = createBayesTruth();
    viaJson.load(JSON.stringify(snapshot));
    expect(viaJson.subjects()).toEqual(['a']);
  });

  it('accepts an external store', () => {
    const store = createMemoryStore();
    const trust = createBayesTruth({ store });
    trust.observe('a', 'success');
    expect(store.get('a')?.successes).toBe(1);
  });
});

describe('observation sink', () => {
  it('feeds observations from an external producer into the store', () => {
    const trust = createBayesTruth({ clock: createDeterministicClock(1) });
    trust.sink({ subject: 'a', outcome: 'success', at: 1 });
    trust.sink({ subject: 'a', outcome: 'failure', at: 2 });
    expect(trust.score('a').samples).toBe(2);
  });
});

describe('time decay through the facade', () => {
  it('lowers trust as time passes without new evidence', () => {
    const clock = createDeterministicClock(0, 1000);
    const trust = createBayesTruth({ clock, decay: { halfLifeMs: 1000 } });
    trust.observeMany('a', 20, 0);
    const before = trust.score('a').score;
    for (let i = 0; i < 100; i += 1) {
      clock();
    }
    expect(trust.score('a').score).toBeLessThan(before);
  });
});

describe('correlated-failure guard (coalesce)', () => {
  it('collapses a burst of identical outcomes inside the window into one event', () => {
    const clock = createDeterministicClock(0, 10);
    const trust = createBayesTruth({ clock, coalesce: { windowMs: 100 } });
    trust.observe('a', 'failure');
    trust.observe('a', 'failure');
    trust.observe('a', 'failure');
    expect(trust.score('a').samples).toBe(1);
    expect(trust.score('a').failures).toBe(1);
  });

  it('does not collapse alternating outcomes', () => {
    const clock = createDeterministicClock(0, 10);
    const trust = createBayesTruth({ clock, coalesce: { windowMs: 100 } });
    trust.observe('a', 'success');
    trust.observe('a', 'failure');
    trust.observe('a', 'success');
    const score = trust.score('a');
    expect(score.successes).toBe(2);
    expect(score.failures).toBe(1);
  });

  it('counts again once the window has elapsed', () => {
    const clock = createDeterministicClock(0, 60);
    const trust = createBayesTruth({ clock, coalesce: { windowMs: 100 } });
    trust.observe('a', 'failure'); // at 0
    trust.observe('a', 'failure'); // at 60, within window, coalesced
    trust.observe('a', 'failure'); // at 120, window elapsed, counted
    expect(trust.score('a').failures).toBe(2);
  });

  it('lets explicit batches bypass coalescing', () => {
    const clock = createDeterministicClock(0, 1);
    const trust = createBayesTruth({ clock, coalesce: { windowMs: 1000 } });
    trust.observeMany('a', 5, 0);
    expect(trust.score('a').successes).toBe(5);
  });
});

describe('audit integration', () => {
  it('records observations, decisions, and selections then seals and verifies', async () => {
    const trust = createBayesTruth({ audit: true, clock: createDeterministicClock(1) });
    trust.observe('a', 'success');
    trust.observeMany('a', 10, 1);
    trust.decide('a');
    trust.select(['a']);
    const log = trust.auditLog();
    expect(log?.entries.some((e) => e.type === 'decision')).toBe(true);
    expect(log?.entries.some((e) => e.type === 'selection')).toBe(true);
    const seal = await trust.seal();
    expect((await trust.verify(seal)).valid).toBe(true);
  });

  it('throws when sealing without auditing enabled', async () => {
    const trust = createBayesTruth();
    await expect(trust.seal()).rejects.toThrow();
    expect(trust.auditLog()).toBeUndefined();
  });
});
