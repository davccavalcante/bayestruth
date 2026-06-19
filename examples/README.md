# BayesTruth examples

Runnable examples and integration patterns. The `.mjs` files import `@takk/bayestruth` as a real
consumer would; run them from a checkout where the package is installed or linked:

```bash
pnpm install
pnpm build
node examples/01-degradation-detection.mjs
```

## Runnable demos

| File | What it shows |
|---|---|
| [`01-degradation-detection.mjs`](./01-degradation-detection.mjs) | A tool degrades and the decision policy flips from `trust` to `distrust` on evidence, before a human would notice. |
| [`02-mcp-trust.mjs`](./02-mcp-trust.mjs) | Wrapping an MCP client so every `callTool` is scored per tool, with `isError` counting as a failure. |
| [`03-bandit-routing.mjs`](./03-bandit-routing.mjs) | Thompson-sampling selection routing most traffic to the strongest tool while still exploring the others. |
| [`04-calibration-check.mjs`](./04-calibration-check.mjs) | Measuring Brier score, log loss, and expected calibration error on a synthetic dataset. |

## Integration patterns

| File | What it shows |
|---|---|
| [`framework-integration.md`](./framework-integration.md) | Drop-in patterns for the Vercel AI SDK, the OpenAI Agents SDK, MCP, and any tool-calling loop. |

Every example is offline and deterministic. None of them call an external service.
