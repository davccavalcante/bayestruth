# BayesTruth

[![status: stable](https://img.shields.io/badge/status-stable-brightgreen)](./CHANGELOG.md)
[![license](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](./LICENSE)
[![version](https://img.shields.io/badge/version-1.0.0-blue)](./CHANGELOG.md)
[![node](https://img.shields.io/badge/node-%E2%89%A520-success)]()
[![tests](https://img.shields.io/badge/tests-170%20passing-brightgreen)]()
[![coverage](https://img.shields.io/badge/coverage-97%25-brightgreen)]()
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-success)]()

<p align="center">
  <img src="https://raw.githubusercontent.com/davccavalcante/bayestruth/main/assets/bayestruth-diagram.svg" alt="How BayesTruth works: every tool, MCP server, or agent earns a calibrated trust score with a confidence range. vector-db scores 0.97 (trust), fetch-tool 0.78 (monitor), search-api dropped to 0.43 (distrust). Trust means use it, monitor means not enough evidence yet, distrust means route away." width="560">
</p>

[![Star History Chart](https://api.star-history.com/svg?repos=davccavalcante/bayestruth&type=timeline&legend=top-left)](https://www.star-history.com/#davccavalcante/bayestruth&type=timeline&legend=top-left)

> Universal, zero-runtime-dependency NPM library and CLI for exact Bayesian trust and reputation scoring of tools, MCP servers, skills, and agents in Massive Intelligence (IM) systems.

BayesTruth sits between your application and the tools it depends on. Every tool, MCP server, skill, or agent carries a Beta posterior over its success rate. Each call is one Bernoulli trial, folded in with the closed-form Beta-Bernoulli conjugate update. A trust score is the posterior mean with a credible interval that respects the sample size, not a fixed threshold someone guessed at design time. Nineteen successes out of twenty is not a flat five percent failure rate, it is a calibrated number with an interval that says how sure you are.

**Core promise:** zero required runtime dependencies, single-function setup, exact closed-form inference with O(1) updates and zero inference latency, a node-free core that runs in Node, edge runtimes, and the browser, ESM plus CJS dual distribution, and SLSA provenance on every release.

---

## Why BayesTruth

Every critical decision in modern Massive Intelligence (IM) infrastructure is a decision under uncertainty: is this tool reliable enough to keep calling, does this MCP server have the reputation for this operation, which of these competing tools should route this request, is this failure a real regime change or statistical noise. Today those decisions run on brittle heuristics: try-catch, retry three times, alert past a guessed threshold. BayesTruth replaces the heuristic with the correct primitive: an explicit prior, continuous updates from evidence, and calibrated uncertainty you can act on and audit.

What sets it apart from rolling your own counter:

- **Exact, not approximate.** The credible interval is the true Beta quantile, computed from `lgamma` via the Lanczos approximation, the regularized incomplete beta via Lentz's continued fraction, and its inverse via bisection. No normal approximation, no hand-waving.
- **Calibration you can verify.** The `calibration` entry ships Brier score, log loss, expected calibration error, and reliability bins, so you can prove the scores are calibrated in your own data instead of trusting the label.
- **Borrows strength across tools.** The `pool` entry fits a shared prior to a category of similar subjects, so a cold-start tool inherits the reputation of its siblings. A per-subject frequentist interval cannot do this.
- **Defends against bursts.** The correlated-failure guard collapses an outage that produced fifty failures into one event, so a single incident does not crater trust or fake confidence.
- **Routes optimally.** Thompson-sampling bandit selection between competing tools, seeded for reproducible, auditable routing.
- **Proves what happened.** A tamper-evident SHA-256 hash-chained audit trail you can seal and verify, the evidence an EU AI Act Article 12 review asks for.

---

## Install

```bash
pnpm add @takk/bayestruth
# or: npm install @takk/bayestruth
# or: yarn add @takk/bayestruth
# or: bun add @takk/bayestruth
```

The core has zero required runtime dependencies. Every `@takk` sibling is an optional peer; install only what you compose with.

---

## Quickstart

```ts
// src/example.ts
import { createBayesTruth } from '@takk/bayestruth';

const trust = createBayesTruth();

// Each tool call is one Bernoulli trial.
trust.observe('search-api', 'success');
trust.observe('search-api', 'success');
trust.observe('search-api', 'failure');

const score = trust.score('search-api');
console.log(score.score);            // posterior mean, the point estimate
console.log(score.interval.lower);   // 95% credible interval lower bound
console.log(score.interval.upper);   // 95% credible interval upper bound

// A calibrated decision, not a guessed threshold.
console.log(trust.decide('search-api')); // 'trust' | 'monitor' | 'distrust'
```

A brand-new subject starts at the uniform prior Beta(1, 1). Trust moves with the evidence, and the interval narrows only as fast as the sample size earns.

---

## Quickstart, MCP servers

Wrap any Model Context Protocol client and every tool call is scored automatically. A result flagged `isError` counts as a failure even when the call resolves.

```ts
import { createBayesTruth } from '@takk/bayestruth';
import { interceptMcpClient } from '@takk/bayestruth/mcp';

const trust = createBayesTruth();

// `client` is any object with a `callTool` method.
const monitored = interceptMcpClient(client, { sink: trust.sink });

await monitored.callTool({ name: 'web_search', arguments: { query: 'IM infrastructure 2026' } });

console.log(trust.score('mcp:web_search')); // reputation accrues per tool
```

This is the trust verification the NSA Cybersecurity Information Sheet on MCP security recommends for every server connection, expressed as a calibrated score instead of a manual review.

---

## Entry points

Fourteen subpath exports, each importable on its own. The core is node-free; only `node` touches a Node built-in.

| Import | What it gives you |
|---|---|
| `@takk/bayestruth` | The `createBayesTruth` facade wiring everything below, plus the full toolkit. |
| `@takk/bayestruth/beta` | The Beta distribution: priors, moments, pdf, cdf, quantile, credible interval, conjugate update. |
| `@takk/bayestruth/trust` | Subject records, scoring, and conservative ranking by credible-interval lower bound. |
| `@takk/bayestruth/bandit` | Thompson-sampling selection between competing subjects, seeded and reproducible. |
| `@takk/bayestruth/decay` | Exponential time-decay of stale evidence back toward the prior. |
| `@takk/bayestruth/store` | The `PosteriorStore` interface, an in-memory store, and portable JSON snapshots. |
| `@takk/bayestruth/policy` | `decideTrust` and `partition`: calibrated trust, monitor, distrust decisions. |
| `@takk/bayestruth/audit` | Append-only SHA-256 hash-chained audit log, seal and verify, via Web Crypto. |
| `@takk/bayestruth/interceptors` | Observation hooks: `observe`, `wrap`, classifiers, deterministic clock. |
| `@takk/bayestruth/mcp` | `interceptMcpClient`, a transparent Proxy scoring every MCP `callTool`. |
| `@takk/bayestruth/calibration` | Brier score, log loss, expected calibration error, reliability bins. |
| `@takk/bayestruth/pool` | Empirical-Bayes pooling so a cold-start subject borrows strength from siblings. |
| `@takk/bayestruth/node` | `createFileStore`, durable file-backed persistence with atomic writes. |
| `@takk/bayestruth/edge` | The node-free core, re-exported for edge runtimes and the browser. |

---

## Decisions, ranking, and routing

```ts
import { createBayesTruth } from '@takk/bayestruth';

const trust = createBayesTruth({
  // A conservative default: trust only when the interval lower bound clears 0.9.
  policy: { trustLower: 0.9, distrustMean: 0.5, minSamples: 5 },
  seed: 42, // reproducible bandit selection
});

trust.observeMany('fast-tool', 90, 10);
trust.observeMany('slow-tool', 40, 2);

trust.rank();                 // best-first, by the conservative lower bound
trust.select(['fast-tool', 'slow-tool']); // Thompson-sampling choice between them
```

Ranking defaults to the credible-interval lower bound, so a single lucky success never outranks a long, proven track record.

---

## Calibration, the claim you can check

A trust score that calls itself calibrated should be falsifiable. Record the score you acted on and the outcome that followed, then measure it.

```ts
import { calibrationReport } from '@takk/bayestruth/calibration';

const report = calibrationReport([
  { p: 0.9, outcome: 'success' },
  { p: 0.9, outcome: 'success' },
  { p: 0.2, outcome: 'failure' },
  // ...one entry per decision you made and its realized outcome
]);

report.brier; // mean squared error, lower is better
report.ece;   // expected calibration error
report.bins;  // reliability diagram, observed rate vs predicted per bin
```

Calibration holds while the modeling assumptions hold: independent Bernoulli trials with a stable success rate. Decay mitigates slow drift, and the correlated-failure guard mitigates bursts. This module is how you confirm it on your own traffic, the measurement an EU AI Act Article 12 reviewer asks for.

---

## Cold start, pooling across a category

A new tool has only its prior. Pooling lets it borrow the reputation of similar tools.

```ts
import { fitCategoryPrior, pooledScore } from '@takk/bayestruth/pool';

const searchTools = [recordA, recordB, recordC]; // observed sibling records
const prior = fitCategoryPrior(searchTools);     // shared Beta fit by method of moments

const fresh = trust.record('new-search-tool');   // little data of its own
pooledScore(fresh, prior).score;                 // pulled toward the group it belongs to
```

A data-rich subject barely moves; a sparse one is pulled toward the category. This partial pooling is the concrete advantage a Bayesian treatment has over a per-subject frequentist interval.

---

## Durable persistence

The default store lives in memory. For trust that survives restarts with no database, use the file-backed store.

```ts
import { createBayesTruth } from '@takk/bayestruth';
import { createFileStore } from '@takk/bayestruth/node';

const trust = createBayesTruth({ store: createFileStore('./trust-store.json') });
trust.observe('payments-api', 'success'); // flushed atomically on every write
```

For higher throughput or multi-process sharing, implement the `PosteriorStore` interface over SQLite, Postgres, or Redis. The file store is the zero-dependency reference.

---

## Tamper-evident audit trail

```ts
const trust = createBayesTruth({ audit: true });
trust.observe('tool-x', 'success');
trust.decide('tool-x');

const seal = await trust.seal();             // SHA-256 hash-chain root over the log
const result = await trust.verify(seal);     // { valid: true }
```

Every observation, decision, and selection is recorded append-only. The seal proves the log was not altered after sealing. It is an integrity seal, not a digital signature: it proves the record was not tampered with, not who produced it. The chain uses the Web Crypto API, so the audit surface runs in Node, edge runtimes, and the browser.

---

## CLI

BayesTruth also works as a command-line tool over a portable store snapshot.

```bash
# Score a subject from a store file.
npx @takk/bayestruth score search-api --store trust-store.json

# Rank every known subject best-first.
npx @takk/bayestruth rank --store trust-store.json

# Fold one outcome in and write the store back.
npx @takk/bayestruth observe search-api success --store trust-store.json

# Verify an audit log against its seal.
npx @takk/bayestruth verify --log audit-log.json --seal audit-seal.json
```

Exit codes follow the sysexits convention: 0 ok, 1 error, 64 usage, 65 data error, 66 missing input. See [examples/](./examples) for runnable demos, including degradation detection and a framework drop-in.

---

## The math, in one paragraph

Each subject has a prior Beta(alpha, beta) over its success rate. An outcome `y` in {0, 1} updates the posterior to Beta(alpha + successes, beta + failures). The trust score is the posterior mean, `(alpha + successes) / (alpha + beta + successes + failures)`. The credible interval is the true Beta quantile of the posterior. Everything is closed form, O(1) per update, with zero inference latency. Priors are explicit and customizable per subject and per category; the decision threshold is always yours, the calibration is always the library's.

---

## Quality

- 170 tests across 20 suites, all passing under Vitest 4.
- Coverage: statements 97.48%, branches 93.55%, functions 100%, lines 97.39%.
- Lint clean under Biome 2.5.
- Typecheck clean under TypeScript 6 in maximum strict mode (`exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noUncheckedIndexedAccess`).
- `publint` clean and `@arethetypeswrong/cli` green across all fourteen subpaths.
- `size-limit` under budget on every bundle (brotli core 4.67 kB against a 14 kB limit).
- Distribution smoke test exercising the compiled ESM and CJS artifacts and the compiled CLI spawned as a single Node process.
- Published with `--provenance` (SLSA attestation by GitHub Actions).

See [SPEC.md](./SPEC.md) for the formal specification, public surface, and stability promise.

---

## FAQ

**Why not just compute `(successes + 1) / (total + 2)` myself?**
That is the posterior mean of a Beta(1, 1), and for a point estimate it is fine. BayesTruth gives you the exact credible interval around it, calibrated decisions, pooling across tools, Thompson-sampling routing, a correlated-failure guard, and a tamper-evident audit trail. The point estimate is the easy part; the calibrated decision is the value.

**Why not a frequentist Wilson interval?**
For a single subject's interval, Wilson is a close substitute. BayesTruth wins where Wilson cannot follow: explicit and per-category priors, partial pooling so a cold-start tool borrows strength from siblings, sequential decisions, and bandit routing, all composed in one calibrated system.

**Does this work in Cloudflare Workers, Vercel Edge, Bun, and Deno?**
Yes. The core is node-free; the audit seal uses the Web Crypto API, not `node:crypto`. Import `@takk/bayestruth` or `@takk/bayestruth/edge` anywhere with `fetch` and Web Crypto. Only `@takk/bayestruth/node` requires Node.

**Is the trust score really calibrated?**
Under the model, independent Bernoulli trials with a stable rate, yes, and the interval is the exact Beta quantile. Real traffic is bursty and non-stationary, so use the correlated-failure guard and decay, and verify on your own data with `@takk/bayestruth/calibration`. The honest claim is calibration under the model, measured, not promised.

**Where does the state live?**
By default, in-process memory, with portable JSON snapshots. For durability, use `createFileStore` from `@takk/bayestruth/node`. For multi-process coordination, implement the `PosteriorStore` interface over your database.

---

## Contributing

See [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) for the contributor guide. Substantive proposals open a GitHub Issue first; trivial fixes can go straight to a PR. All commits require DCO sign-off (`git commit -s`). Non-trivial contributions are governed by the [Contributor License Agreement](./CLA.md).

## Community and support

- **Issues and feature requests.** Open a GitHub issue at [`davccavalcante/bayestruth/issues`](https://github.com/davccavalcante/bayestruth/issues). Include the package version, a minimal reproduction, expected versus actual behavior, and where relevant the subject's `score()` or `record()` output.
- **Security disclosures.** Do not open public issues for vulnerabilities. Follow the responsible-disclosure flow in [`SECURITY.md`](./SECURITY.md), contact `davcavalcante@proton.me` (or `say@takk.ag`) with the `[SECURITY]` prefix.
- **Code of Conduct.** This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Participation in any BayesTruth space implies agreement.
- **Contributions.** All non-trivial contributions go through the [Contributor License Agreement](./CLA.md). Tests, lint, typecheck, and build must be green before review (`pnpm verify`).

---

## Author

Created by **David C Cavalcante**, [davcavalcante@proton.me](mailto:davcavalcante@proton.me) (preferred), [say@takk.ag](mailto:say@takk.ag) (Takk relay), [linkedin.com/in/hellodav](https://linkedin.com/in/hellodav), [x.com/davccavalcante](https://x.com/davccavalcante), [takk.ag](https://takk.ag/).

BayesTruth is part of a broader portfolio of NPM packages targeting Massive Intelligence (IM) native infrastructure for 2026-2030, built at Takk Innovate Studio.

---

## Related research by the author

The architectural philosophy behind BayesTruth, separating inference, decision, and persistence into composable, independently-governed layers, echoes the author's research frameworks:

- **MAIC (Massive Artificial Intelligence Consciousness)**, a systemic intelligence framework designed to coordinate, supervise, and govern large-scale Massive Intelligence ecosystems, providing global context awareness, alignment, and orchestration across multiple models, agents, and decision layers.
- **HIM (Hybrid Entity Intelligence Model)**, a hybrid intelligence layer that integrates Massive Intelligence systems with human-defined logic, rules, heuristics, and strategic intent, interpreting objectives and structuring decision-making before and after model execution.
- **NHE (Noumenal Higher-order Entity)**, a non-human cognitive entity with a defined functional identity and operational agency within a Massive Intelligence ecosystem, operating through coordinated intelligence layers while maintaining a non-anthropomorphic identity.

These frameworks are published independently of BayesTruth and are separate works:

- Research papers: [The Soul of the Machine](https://philarchive.org/rec/CRTTSO), [Beyond Consciousness in LLMs](https://philarchive.org/rec/CRTBCI), [The Cave of Silence](https://philarchive.org/rec/CRTTCO).
- PhilPapers profile: [David Cortes Cavalcante](https://philpeople.org/profiles/david-cortes-cavalcante).
- Hugging Face: [TeleologyHI](https://huggingface.co/TeleologyHI).
- GitHub: [davccavalcante](https://github.com/davccavalcante), [Takk8IS](https://github.com/Takk8IS).

---

## Sponsors

Join the journey as the portfolio continues to ship Massive Intelligence (IM) native infrastructure. Your support is the cornerstone of this work.

- Sponsor on GitHub: [github.com/sponsors/davccavalcante](https://github.com/sponsors/davccavalcante)
- USDT (TRC-20): `TS1vuhMAhFpbd7y68cu5ZtP9PsXVmZWmeh`

---

## Privacy

BayesTruth runs entirely inside your own process and infrastructure. It makes no outbound calls to the author, collects no telemetry, and ships no analytics. The only state it holds is the trust evidence you feed it. See [PRIVACY.md](./PRIVACY.md) for the full data-handling notice, including how the optional file store persists state on disk.

---

## License

Licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) for the full text and [NOTICE](./NOTICE) for attribution and third-party component licenses. You may use, modify, and distribute the code under the terms of that license, including its patent grant and attribution requirements.
