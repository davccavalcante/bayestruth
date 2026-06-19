# Framework integration

BayesTruth scores any tool call you report, so it drops into any agent framework. The observation hook
is the seam: wrap the function that calls a tool, classify success or failure, and feed the outcome to a
BayesTruth instance through its `sink` or with `wrap`. These patterns are illustrative; install the
framework SDK you actually use.

## Vercel AI SDK

The Vercel AI SDK calls tools you define. Wrap each tool's `execute` so every call is scored, and gate
or rank tools by their trust before you pass them to the model.

```ts
import { createBayesTruth } from '@takk/bayestruth';
import { wrap } from '@takk/bayestruth/interceptors';

const trust = createBayesTruth();

// `tool` is a Vercel AI SDK tool definition.
function scored(name, tool) {
  return {
    ...tool,
    execute: wrap(name, tool.execute, { sink: trust.sink }),
  };
}

const tools = {
  search: scored('search', searchTool),
  fetchPage: scored('fetchPage', fetchPageTool),
};

// Before a run, drop tools the policy distrusts.
const trusted = Object.fromEntries(
  Object.entries(tools).filter(([name]) => trust.decide(name) !== 'distrust'),
);
```

A tool that throws is scored as a failure automatically. To score a non-throwing failure (a tool that
returns an error shape), pass an `isSuccess` classifier to `wrap`.

## OpenAI Agents SDK

The OpenAI Agents SDK runs tools through a tool registry. Wrap each tool's invocation the same way, then
use `trust.rank()` to prefer the most reliable tool when several can serve a step, or `trust.select()`
to route by Thompson sampling.

```ts
import { createBayesTruth } from '@takk/bayestruth';
import { observe } from '@takk/bayestruth/interceptors';

const trust = createBayesTruth({ seed: 1 });

async function runTool(name, args) {
  // observe() records the outcome and rethrows on failure, so your error handling is unchanged.
  return observe(name, () => registry[name].run(args), { sink: trust.sink });
}

// Route between competing tools by reliability.
const choice = trust.select(['search-fast', 'search-thorough']);
await runTool(choice.subject, args);
```

## Model Context Protocol

For MCP servers, use the dedicated bridge, which needs no per-tool wiring. See
[`02-mcp-trust.mjs`](./02-mcp-trust.mjs).

```ts
import { interceptMcpClient } from '@takk/bayestruth/mcp';

const monitored = interceptMcpClient(client, { sink: trust.sink });
// Every monitored.callTool({ name }) is now scored under `mcp:<name>`.
```

## Any other framework

The pattern is always the same: find the single function that invokes a tool, wrap it with `wrap` or
`observe`, and feed the outcome to a BayesTruth instance. Then read `trust.score`, `trust.decide`,
`trust.rank`, or `trust.select` wherever you make a routing or gating decision.
