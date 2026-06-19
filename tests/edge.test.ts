import { describe, expect, it } from 'vitest';
import * as edge from '../src/edge/index.js';

describe('edge entry point', () => {
  it('re-exports the node-free core', () => {
    expect(typeof edge.createBayesTruth).toBe('function');
    expect(typeof edge.scoreRecord).toBe('function');
    expect(edge.UNIFORM_PRIOR).toEqual({ alpha: 1, beta: 1 });
  });

  it('runs the core through the edge surface', () => {
    const trust = edge.createBayesTruth();
    trust.observe('a', 'success');
    expect(trust.score('a').samples).toBe(1);
  });
});
