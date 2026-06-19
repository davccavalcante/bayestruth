/**
 * Scoring MCP tools automatically.
 *
 * Wrap any Model Context Protocol client and every `callTool` is scored as a Bernoulli trial. A result
 * flagged `isError` counts as a failure even when the call resolves. This example uses a fake client so
 * it runs with no network. Run with: `node examples/02-mcp-trust.mjs`.
 */

import { createBayesTruth } from '@takk/bayestruth';
import { interceptMcpClient } from '@takk/bayestruth/mcp';

const trust = createBayesTruth();

// A fake MCP client. `good` always works; `flaky` fails about half the time.
const client = {
  async callTool({ name }, attempt = 0) {
    if (name === 'flaky') {
      return { isError: attempt % 2 === 0, content: name };
    }
    return { content: name };
  },
};

const monitored = interceptMcpClient(client, { sink: trust.sink });

for (let i = 0; i < 20; i += 1) {
  await monitored.callTool({ name: 'good' });
  await monitored.callTool({ name: 'flaky' }, i);
}

for (const subject of trust.subjects()) {
  const score = trust.score(subject);
  process.stdout.write(
    `${subject}: score ${score.score.toFixed(3)}, ` +
      `interval [${score.interval.lower.toFixed(3)}, ${score.interval.upper.toFixed(3)}], ` +
      `decision ${trust.decide(subject)}\n`,
  );
}
