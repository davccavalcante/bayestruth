/**
 * Routing between competing tools by Thompson sampling.
 *
 * When several tools can serve the same request, BayesTruth picks one by drawing from each posterior
 * and choosing the maximum. The seed makes the routing reproducible. Over many rounds, the stronger
 * tool wins most of the traffic while the others still get explored. Run with:
 * `node examples/03-bandit-routing.mjs`.
 */

import { createBayesTruth } from '@takk/bayestruth';

const trust = createBayesTruth({ seed: 7 });

// Three tools with different true reliabilities and modest history, so the posteriors still overlap
// and the bandit keeps exploring rather than locking onto one tool prematurely.
trust.observeMany('tool-a', 9, 1); // ~0.83
trust.observeMany('tool-b', 6, 4); // ~0.58
trust.observeMany('tool-c', 3, 7); // ~0.33

const counts = { 'tool-a': 0, 'tool-b': 0, 'tool-c': 0 };
for (let i = 0; i < 1000; i += 1) {
  const choice = trust.select(['tool-a', 'tool-b', 'tool-c']);
  counts[choice.subject] += 1;
}

process.stdout.write('Selections across 1000 routing rounds:\n');
for (const [subject, count] of Object.entries(counts)) {
  process.stdout.write(`  ${subject}: ${count}\n`);
}
process.stdout.write('\nThe strongest tool wins most rounds; the others are still explored.\n');
