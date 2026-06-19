import { describe, expect, it } from 'vitest';
import {
  createDeterministicClock,
  httpStatusIsSuccess,
  type Observation,
  observe,
  observeSync,
  wrap,
  wrapSync,
} from '../src/interceptors/index.js';

function collector() {
  const seen: Observation[] = [];
  return { seen, sink: (o: Observation) => seen.push(o) };
}

describe('createDeterministicClock', () => {
  it('advances by the configured step', () => {
    const clock = createDeterministicClock(10, 5);
    expect(clock()).toBe(10);
    expect(clock()).toBe(15);
    expect(clock()).toBe(20);
  });
});

describe('observe', () => {
  it('records a success for a resolved call and returns the value', async () => {
    const { seen, sink } = collector();
    const value = await observe('a', async () => 42, { sink, clock: createDeterministicClock(1) });
    expect(value).toBe(42);
    expect(seen).toEqual([{ subject: 'a', outcome: 'success', at: 1 }]);
  });

  it('records a failure and rethrows when the call rejects', async () => {
    const { seen, sink } = collector();
    await expect(
      observe(
        'a',
        async () => {
          throw new Error('boom');
        },
        { sink },
      ),
    ).rejects.toThrow('boom');
    expect(seen[0]?.outcome).toBe('failure');
    expect(seen[0]?.error).toBeInstanceOf(Error);
  });

  it('uses a classifier to score a returned value', async () => {
    const { seen, sink } = collector();
    await observe('a', async () => ({ status: 500 }), { sink, isSuccess: httpStatusIsSuccess });
    expect(seen[0]?.outcome).toBe('failure');
  });
});

describe('observeSync', () => {
  it('records a success for a returning call', () => {
    const { seen, sink } = collector();
    expect(observeSync('a', () => 1, { sink })).toBe(1);
    expect(seen[0]?.outcome).toBe('success');
  });

  it('records a failure and rethrows for a throwing call', () => {
    const { seen, sink } = collector();
    expect(() =>
      observeSync(
        'a',
        () => {
          throw new Error('x');
        },
        { sink },
      ),
    ).toThrow('x');
    expect(seen[0]?.outcome).toBe('failure');
  });

  it('applies a classifier synchronously', () => {
    const { seen, sink } = collector();
    observeSync('a', () => false, { sink, isSuccess: (v) => v === true });
    expect(seen[0]?.outcome).toBe('failure');
  });
});

describe('wrap and wrapSync', () => {
  it('wraps an async function so every call is observed', async () => {
    const { seen, sink } = collector();
    const fn = wrap('svc', async (x: number) => x * 2, { sink });
    expect(await fn(3)).toBe(6);
    expect(await fn(4)).toBe(8);
    expect(seen).toHaveLength(2);
    expect(seen.every((o) => o.outcome === 'success')).toBe(true);
  });

  it('wraps a sync function so every call is observed', () => {
    const { seen, sink } = collector();
    const fn = wrapSync('svc', (x: number) => x + 1, { sink });
    expect(fn(1)).toBe(2);
    expect(seen).toHaveLength(1);
  });
});

describe('httpStatusIsSuccess', () => {
  it('treats sub-400 statuses as success', () => {
    expect(httpStatusIsSuccess({ status: 200 })).toBe(true);
    expect(httpStatusIsSuccess({ status: 404 })).toBe(false);
  });
});
