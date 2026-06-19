# Changelog

All notable changes to `@takk/bayestruth` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry carries a UTC timestamp.

## [1.0.0] - 2026-06-19T20:18:08Z

Initial stable release. Universal, zero-runtime-dependency NPM library and CLI for exact Bayesian trust and reputation scoring of tools, MCP servers, skills, and agents in Massive Intelligence (IM) systems. Every subject carries a Beta posterior over its success rate; each observed call is a Bernoulli trial folded in with the closed-form Beta-Bernoulli conjugate update, so a trust score is a calibrated posterior mean with a credible interval that respects the sample size, not a heuristic threshold.

### Added

#### Bayesian core

- Exact Beta distribution toolkit: `betaMean`, `betaVariance`, `betaStddev`, `betaMode`, `betaPdf`, `betaCdf`, `betaQuantileOf`, and `credibleInterval` (equal-tailed at any level).
- Closed-form conjugate updates: `update` (one Bernoulli outcome) and `updateBatch` (a batch of successes and failures), each O(1) with zero inference latency.
- Built-in priors `UNIFORM_PRIOR` (Beta(1, 1)) and `JEFFREYS_PRIOR` (Beta(0.5, 0.5)), plus fully customizable priors per subject and per category.
- Special functions implemented from scratch with no dependency: `lgamma` via the Lanczos approximation, the regularized incomplete beta (the Beta CDF) via Lentz's continued fraction, and its inverse (the Beta quantile) via bisection. The credible interval is the true Beta quantile, not a normal approximation.
- Seeded sampling (`mulberry32`, Box-Muller normal, Marsaglia-Tsang gamma, and Beta sampling) so every stochastic decision is reproducible and auditable.

#### Trust scoring

- `initialRecord`, `observeRecord`, and `scoreRecord` maintain one `SubjectRecord` per subject and summarize it into a calibrated `TrustScore` (mean, mode, standard deviation, credible interval, counts).
- `rankScores` ranks subjects best-first, by the conservative credible-interval lower bound by default, so a single lucky success is not ranked above a long, proven track record.

#### Decision policies

- `decideTrust` returns `trust`, `monitor`, or `distrust`: a subject is trusted only when its credible-interval lower bound clears the bar, distrusted when its posterior mean falls below the floor, and monitored otherwise, including while the sample is still too small to judge.
- `DEFAULT_TRUST_POLICY` ships a conservative default; `partition` buckets a set of scores into the three decisions.

#### Bandit selection

- `thompsonSelect` and `createBandit` route between competing subjects by Thompson sampling, drawing once from each posterior and picking the maximum. Seeding makes the choice reproducible for testable, auditable routing.

#### Time-decay and the correlated-failure guard

- Opt-in exponential time-decay (`decayFactor`, `decayRecord`, and the `decay` facade option) pulls stale evidence back toward the prior with a configurable half-life, the escape hatch for slow non-stationarity. The posterior never decays below the prior, so it stays a valid Beta.
- Opt-in correlated-failure guard (`coalesce` facade option) collapses a run of identical consecutive outcomes inside a window into a single event, so an outage that produces many failures, or a hot path that produces many successes, is not mistaken for that many independent Bernoulli trials. This defends the calibration claim under the bursty, non-i.i.d. traffic of real tools. Explicit batches via `observeMany` bypass it.

#### Calibration diagnostics

- `brierScore`, `logLoss`, `reliabilityBins`, `expectedCalibrationError`, and `calibrationReport` let a consumer verify the calibration claim in their own environment instead of taking it on faith. This is the measurement an EU AI Act Article 12 reviewer asks for, not a promise of calibration but evidence of it.

#### Empirical-Bayes pooling

- `fitCategoryPrior` fits a shared Beta prior to a group of similar subjects by method of moments on their observed success rates; `pooledRecord`, `pooledScore`, and `poolCategory` re-anchor each subject on the fitted prior. A cold-start subject borrows strength from its siblings while a data-rich one barely moves, the partial pooling that a per-subject frequentist interval cannot provide.

#### Posterior store and persistence

- `PosteriorStore` interface with an in-memory default (`createMemoryStore`) and portable JSON snapshots (`encodeStore`, `decodeStore`, `loadStore`), so trust accumulated in one process can be restored in another and exported as evidence.
- `@takk/bayestruth/node` ships `createFileStore`, a durable file-backed store using `node:fs` with atomic writes (write to a temporary file, then rename), so trust survives restarts with no database. It is the only entry point that touches a Node built-in.

#### Audit trail

- Append-only audit log (`createAuditLog`) recording every observation, decision, and selection, with a tamper-evident SHA-256 hash chain you can `seal` and later `verify`. The chain uses the Web Crypto API, not `node:crypto`, so the audit surface stays node-free and runs in Node, edge runtimes, and the browser. It is an integrity seal, not a digital signature: it proves a log was not altered after sealing, not who produced it.

#### Observation hooks and MCP

- `observe`, `observeSync`, `wrap`, and `wrapSync` turn any sync or async call into a Bernoulli outcome, with pluggable success classifiers and a deterministic clock for tests; the facade exposes a `sink` that folds those outcomes into the store.
- `@takk/bayestruth/mcp` ships `interceptMcpClient`, a transparent Proxy around any Model Context Protocol client that scores every `callTool` invocation per tool, counting a result flagged `isError` as a failure even when the call resolves.

#### CLI

- Binary `bayestruth` exposed via `package.json#bin`.
- `bayestruth score <subject>`, `rank`, `inspect <subject>`, `observe <subject> <success|failure>`, `verify`, and `help`, reading a portable store snapshot from a file or stdin and writing updated stores back atomically.
- Standard sysexits-style exit codes: 0 ok, 1 error, 64 usage, 65 data error, 66 missing input.
- Pure command logic in `runCli` over an injected IO surface, unit-testable without touching the filesystem or the process.

#### Distribution

- Fourteen entry points, each a subpath export with split `import`/`require` conditions: the root facade plus `beta`, `trust`, `bandit`, `decay`, `store`, `policy`, `audit`, `interceptors`, `mcp`, `calibration`, `pool`, `node`, and `edge`.
- Dual ESM + CJS bundles built with tsup 8, target `es2022`, with separate `.d.ts` and `.d.cts` type files per entry point.
- Node-free, platform-neutral core (the audit seal uses the Web Crypto API), importable in Node, edge runtimes, and the browser; `@takk/bayestruth/edge` re-exports it verbatim.
- Zero required runtime dependencies. All `@takk` siblings are optional peer dependencies.

#### Documentation and examples

- Complete project site (`index.html`, `404.html`) and documentation set (`README.md`, `SPEC.md`, `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, `RELEASING.md`, `CLA.md`, `CODE_OF_CONDUCT.md`), with JSON-LD structured data, an Open Graph card, and a robots and sitemap pair.
- Four runnable, offline, deterministic examples (degradation detection, MCP trust scoring, Thompson-sampling routing, calibration check) plus a framework-integration guide for the Vercel AI SDK, the OpenAI Agents SDK, and the Model Context Protocol.

### Quality

- 170 tests across 20 suites passing under Vitest 4.
- Coverage: statements 97.48%, branches 93.55%, functions 100%, lines 97.39%.
- Lint clean under Biome 2.5.0.
- Typecheck clean under TypeScript 6.0.3 (with `ignoreDeprecations: "6.0"` for the legacy option injected by tsup's dts pipeline).
- `publint` clean and `@arethetypeswrong/cli` green across all fourteen subpaths and `package.json`.
- `size-limit` under budget on every bundle (brotli core 4.67 kB against a 14 kB limit).
- Distribution smoke test (22 checks) exercising the compiled ESM and CJS artifacts and the compiled CLI spawned as a single Node process.

### Security

- Published with `--provenance` (SLSA attestation by GitHub Actions when released via the publish workflow). Consumers can verify via `npm view @takk/bayestruth --json | jq .dist.attestations`.
- Tamper-evident audit trail backed by a SHA-256 hash chain, suitable as compliance evidence that trust decisions were made on the recorded evidence. It is an integrity seal, not a signature.
- The correlated-failure guard prevents a single outage from being recorded as many independent failures, which would both crater trust and overstate confidence.

### Licensing

- Licensed under the Apache License, Version 2.0. The `NOTICE` file ships in the tarball alongside `LICENSE`.

### Engines

- Node `>=20.0.0`. Tested on Node 20, 22, and 24.

## [Unreleased]

Highlights queued for future releases:

- Persistence backends over the `PosteriorStore` interface: SQLite, Postgres, and Redis.
- Native integrations for Vercel AI SDK, OpenAI Agents SDK, Mastra, and LangChain JS.
- Signed and timestamped audit seals for stronger third-party compliance evidence.
- Multi-level hierarchical pooling across categories of categories.
- Federated trust sharing across organizations.
