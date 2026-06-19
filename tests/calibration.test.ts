import { describe, expect, it } from 'vitest';
import {
  brierScore,
  calibrationReport,
  expectedCalibrationError,
  logLoss,
  type Prediction,
  reliabilityBins,
} from '../src/calibration/index.js';

const perfect: Prediction[] = [
  { p: 1, outcome: 'success' },
  { p: 0, outcome: 'failure' },
  { p: 1, outcome: true },
  { p: 0, outcome: false },
];

const worst: Prediction[] = [
  { p: 0, outcome: 'success' },
  { p: 1, outcome: 'failure' },
];

describe('brierScore', () => {
  it('is 0 for perfect predictions and 1 for the worst', () => {
    expect(brierScore(perfect)).toBe(0);
    expect(brierScore(worst)).toBe(1);
  });

  it('is 0.25 for a coin-flip prediction', () => {
    expect(
      brierScore([
        { p: 0.5, outcome: 'success' },
        { p: 0.5, outcome: 'failure' },
      ]),
    ).toBeCloseTo(0.25, 12);
  });

  it('rejects an empty set and out-of-range probabilities', () => {
    expect(() => brierScore([])).toThrow();
    expect(() => brierScore([{ p: 1.2, outcome: 'success' }])).toThrow();
  });
});

describe('logLoss', () => {
  it('is near zero for confident correct predictions', () => {
    expect(logLoss(perfect)).toBeLessThan(1e-10);
  });

  it('penalizes confident wrong predictions heavily but finitely', () => {
    const loss = logLoss(worst);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThan(10);
  });
});

describe('reliabilityBins', () => {
  it('partitions predictions into the requested number of bins', () => {
    const bins = reliabilityBins(
      [
        { p: 0.05, outcome: false },
        { p: 0.95, outcome: true },
        { p: 1, outcome: true },
      ],
      10,
    );
    expect(bins).toHaveLength(10);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(3);
    expect(bins[9]?.count).toBe(2); // 0.95 and 1.0 both land in the last bin
  });

  it('rejects a non-positive bin count', () => {
    expect(() => reliabilityBins(perfect, 0)).toThrow();
  });
});

describe('expectedCalibrationError', () => {
  it('is near zero for a well-calibrated source', () => {
    const predictions: Prediction[] = [];
    for (let i = 0; i < 100; i += 1) {
      predictions.push({ p: 0.7, outcome: i < 70 });
    }
    expect(expectedCalibrationError(predictions, 10)).toBeCloseTo(0, 6);
  });

  it('grows when confidence and accuracy diverge', () => {
    const predictions: Prediction[] = [];
    for (let i = 0; i < 100; i += 1) {
      predictions.push({ p: 0.9, outcome: i < 50 });
    }
    expect(expectedCalibrationError(predictions, 10)).toBeCloseTo(0.4, 6);
  });
});

describe('calibrationReport', () => {
  it('bundles every diagnostic', () => {
    const report = calibrationReport(perfect);
    expect(report.count).toBe(4);
    expect(report.brier).toBe(0);
    expect(report.ece).toBeCloseTo(0, 12);
    expect(report.bins).toHaveLength(10);
    expect(report.logLoss).toBeLessThan(1e-10);
  });
});
