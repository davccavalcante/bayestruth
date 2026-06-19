/**
 * Vitest global setup for the BayesTruth test suite.
 *
 * Runs once before the whole suite. It pins the process time zone to UTC so any incidental
 * time-derived assertion is stable across machines. The library never reads the ambient time zone;
 * timestamps are always injected through the clock option, so this only guards test-side incidentals.
 *
 * @packageDocumentation
 */

export default function setup(): void {
  process.env.TZ = 'UTC';
}
