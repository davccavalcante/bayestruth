/**
 * Seeded pseudo-random sampling for Thompson selection.
 *
 * A deterministic uniform generator (mulberry32) plus normal, gamma, and Beta samplers. Seeding
 * makes bandit selection reproducible: the same seed and the same posteriors always pick the same
 * subject, which matters for testable, auditable decisions. Pure, dependency-free.
 *
 * @packageDocumentation
 */

/** A uniform random source returning a float in [0, 1). */
export type Rng = () => number;

/** Create a deterministic uniform generator from a 32-bit seed (mulberry32). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a standard normal sample via the Box-Muller transform. */
export function sampleNormal(rng: Rng): number {
  let u1 = rng();
  if (u1 < Number.MIN_VALUE) {
    u1 = Number.MIN_VALUE;
  }
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Draw a Gamma(shape, 1) sample using the Marsaglia and Tsang method. Shapes below 1 are handled by
 * the boosting identity `Gamma(k) = Gamma(k + 1) * U^(1/k)`.
 */
export function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) {
    const boost = sampleGamma(shape + 1, rng);
    let u = rng();
    if (u < Number.MIN_VALUE) {
      u = Number.MIN_VALUE;
    }
    return boost * u ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/** Draw a sample from a Beta(a, b) distribution via two Gamma draws. */
export function sampleBeta(a: number, b: number, rng: Rng): number {
  const ga = sampleGamma(a, rng);
  const gb = sampleGamma(b, rng);
  const total = ga + gb;
  return total === 0 ? 0.5 : ga / total;
}
