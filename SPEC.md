# @takk/bayestruth - Technical Specification

**Version:** 1.0.0
**Status:** Stable
**License:** Apache-2.0

This document is the binding contract between `@takk/bayestruth` and its consumers. Behavior described here is covered by SemVer: breaking changes require a major version bump and a deprecation cycle (see [SEMVER POLICY](#52-semver-policy)).

---

## 1. Purpose

BayesTruth is a universal, zero-runtime-dependency library and CLI that maintains an exact Bayesian trust score for every tool, MCP server, skill, or agent a TypeScript/JavaScript application depends on, transparently:

- **Modeling** each subject as a Beta posterior over its success rate.
- **Updating** that posterior in closed form on each observed Bernoulli outcome, with O(1) updates and zero inference latency.
- **Quantifying** uncertainty with the exact Beta credible interval, not a fixed threshold.
- **Deciding** trust, monitor, or distrust against a calibrated policy.
- **Routing** between competing subjects by Thompson sampling.
- **Proving** the decision trail with a tamper-evident hash-chained audit log.

It is library-shaped, not service-shaped. There is no central server, no SaaS dependency, no SDK lock-in. The core is node-free; it runs in Node, edge runtimes, and the browser.

---

## 2. Public surface

### 2.1 Entry points

The package ships fourteen subpath exports, each with separate `import` (ESM) and `require` (CJS) conditions and matching `.d.ts` / `.d.cts` files:

| Subpath | Use |
|---|---|
| `.` | Facade `createBayesTruth`, plus the full toolkit and types |
| `./beta` | Beta distribution: priors, moments, pdf, cdf, quantile, credible interval, conjugate update |
| `./trust` | Subject records, scoring, conservative ranking |
| `./bandit` | Thompson-sampling selection |
| `./decay` | Exponential time-decay of evidence |
| `./store` | `PosteriorStore` interface, in-memory store, snapshot encode/decode/load |
| `./policy` | `decideTrust`, `partition`, default policy |
| `./audit` | Append-only SHA-256 hash-chained audit log, seal and verify |
| `./interceptors` | Observation hooks: `observe`, `wrap`, classifiers, deterministic clock |
| `./mcp` | `interceptMcpClient` for Model Context Protocol clients |
| `./calibration` | Brier score, log loss, expected calibration error, reliability bins |
| `./pool` | Empirical-Bayes pooling across a category of subjects |
| `./node` | `createFileStore`, durable file-backed persistence (the only Node-only entry) |
| `./edge` | The node-free core, re-exported for edge runtimes |
| `./package.json` | Manifest access for tooling |

A `bayestruth` binary is exposed via `package.json#bin -> ./dist/cli/index.js`.

### 2.2 Core API

#### `createBayesTruth(options?: BayesTruthOptions): BayesTruth`

Returns a fully wired instance binding the posterior store, the scorer, optional time-decay, the optional correlated-failure guard, the Thompson-sampling bandit, the decision policy, and the optional audit log.

```ts
interface BayesTruthOptions {
  prior?: Prior;                       // default UNIFORM_PRIOR Beta(1, 1)
  store?: PosteriorStore;              // default in-memory
  clock?: Clock;                       // default Date.now
  level?: number;                      // credible-interval level, default 0.95
  policy?: TrustPolicy;                // default DEFAULT_TRUST_POLICY
  decay?: DecayOptions;                // off by default
  coalesce?: { windowMs: number };     // correlated-failure guard, off by default
  seed?: number;                       // bandit seed, default 1
  audit?: boolean;                     // off by default
}
```

```ts
interface BayesTruth {
  observe(subject: string, outcome: Outcome | boolean): SubjectRecord;
  observeMany(subject: string, successes: number, failures: number): SubjectRecord;
  record(subject: string): SubjectRecord;
  score(subject: string): TrustScore;
  scoreAll(): TrustScore[];
  interval(subject: string, level?: number): CredibleInterval;
  posterior(subject: string): Posterior;
  decide(subject: string, policy?: TrustPolicy): TrustDecision;
  rank(by?: 'mean' | 'lower'): TrustScore[];
  select(subjects?: ReadonlyArray<string>): BanditChoice;
  subjects(): string[];
  snapshot(): StoreSnapshot;
  load(input: StoreSnapshot | string): void;
  readonly sink: OutcomeSink;
  auditLog(): AuditLog | undefined;
  seal(): Promise<AuditSeal>;
  verify(seal: AuditSeal): Promise<VerifyResult>;
}
```

### 2.3 Error model

A single error type carries a stable, machine-readable code. Callers branch on `error.code`, never on message text.

```
Error
 └─ BayesTruthError  { code: BayesTruthErrorCode, details?: Record<string, unknown> }
```

| Code | Raised when |
|---|---|
| `ERR_INVALID_INPUT` | Malformed argument, snapshot, or option |
| `ERR_INVALID_PRIOR` | A Beta shape parameter is not finite and positive |
| `ERR_NO_SUBJECTS` | Selection requested with no subjects |
| `ERR_NOT_FOUND` | A required subject is absent |
| `ERR_INVALID_AUDIT` | A malformed log or an unsupported seal algorithm |
| `ERR_NUMERIC` | A special-function domain error |

`isBayesTruthError(value)` is the exported type guard.

### 2.4 Audit events

Each entry has `seq`, `at`, `type`, `summary`, and an optional `data` payload. The `type` is one of `observation`, `decision`, `selection`, `note`. The seal is an `AuditSeal { algorithm: 'sha-256', root, count }`; verification returns `VerifyResult { valid, brokenAt? }`. The seal is an integrity seal, not a digital signature: it proves a log was not altered after sealing, not who produced it.

---

## 3. Architecture

```
+-----------------------------------------+
| Caller code                             |
| const trust = createBayesTruth({...})   |
| trust.observe('search-api', 'success')  |
+-------------------+---------------------+
                    | observation
                    v
+-----------------------------------------+
| Facade                                  |
| - Observation hook (interceptors, mcp)  |
| - Correlated-failure guard (coalesce)   |
| - Time-decay (optional)                 |
| - Conjugate update (beta)               |
| - Posterior store (store, node)         |
| - Query engine (trust, calibration, pool)|
| - Decision policy (policy)              |
| - Bandit selection (bandit)             |
| - Audit trail (audit)                   |
+-------------------+---------------------+
                    | TrustScore / TrustDecision / BanditChoice
                    v
              Caller decisions
```

### 3.1 Inference

Each subject holds a `Posterior { alpha, beta }`. An outcome `y` in {0, 1} updates it to `Beta(alpha + successes, beta + failures)`. The trust score is the posterior mean. The credible interval is the exact Beta quantile, computed from `lgamma` (Lanczos), the regularized incomplete beta (Lentz continued fraction), and its inverse (bisection). Priors are explicit: `UNIFORM_PRIOR` Beta(1, 1) and `JEFFREYS_PRIOR` Beta(0.5, 0.5) ship, and any prior is accepted per subject and per category.

### 3.2 Posterior store

`PosteriorStore` requires `get`, `set`, `keys`, and `snapshot`. `createMemoryStore` is the default; `createFileStore` (from `./node`) persists to a JSON file with atomic writes (write to a temporary file, then rename). A snapshot is portable JSON; `encodeStore`, `decodeStore`, and `loadStore` round-trip it with validation.

### 3.3 Correlated-failure guard

When `coalesce: { windowMs }` is set, a run of identical consecutive outcomes for a subject within the window counts as a single event, so an outage that produces many failures, or a hot path producing many successes, is not mistaken for that many independent Bernoulli trials. Explicit batches via `observeMany` bypass the guard. Off by default.

### 3.4 Time-decay

When `decay: { halfLifeMs }` is set, evidence above the prior is scaled back toward the prior by `0.5 ** (elapsed / halfLifeMs)` on read, the escape hatch for slow non-stationarity. The posterior never decays below the prior, so it stays a valid Beta. Off by default.

### 3.5 Decision policy

`TrustPolicy { trustLower, distrustMean, minSamples }`. A subject is `trust` only when its credible-interval lower bound is at or above `trustLower`, `distrust` when its posterior mean is below `distrustMean`, and `monitor` otherwise, including while `samples < minSamples`. `DEFAULT_TRUST_POLICY` is `{ trustLower: 0.9, distrustMean: 0.5, minSamples: 5 }`.

### 3.6 Bandit selection

`select` draws once from each subject's posterior and picks the maximum (Thompson sampling). The generator is seeded (`mulberry32`), so the same seed and posteriors always select the same subject.

### 3.7 Audit trail

`createAuditLog` records observations, decisions, and selections append-only. `seal` computes a SHA-256 hash-chain root over the canonicalized entries via the Web Crypto API; `verify` recomputes and compares. Canonical JSON serialization (key-sorted) makes the chain reproducible across runtimes.

---

## 4. Operational SLOs

The library is small; targets here are runtime characteristics, not service SLOs.

| Target | Budget |
|---|---|
| Runtime dependencies (required) | 0 |
| ESM core bundle (`dist/index.js`) | <= 14 KB brotli (currently 4.67 KB) |
| Per-observation update | O(1), closed form |
| Per-score credible interval | exact Beta quantile, deterministic |
| Engines | Node >= 20.0.0 |
| Node-free core | the audit seal uses Web Crypto, not node:crypto |

Bundle budgets are enforced by `size-limit` in CI.

---

## 5. Stability promise

### 5.1 What counts as the public API

For 1.0.0 onward:

- Every name exported from the root and from each subpath export.
- Every type, interface, class shape, function signature, and discriminated-union variant reachable from those exports.
- The shape of `BayesTruthOptions`, `TrustScore`, `SubjectRecord`, `StoreSnapshot`, `TrustPolicy`, and every audit type.
- The CLI flags and subcommands of `bayestruth`.
- The JSON schema of a store snapshot and of an audit log.

Not part of the public API:

- Anything inside `src/` that is not re-exported from a public entry point.
- The internal numerics constants of the special functions.
- The format of any debug output.

### 5.2 SemVer policy

| Change | Bump |
|---|---|
| Bug fix, internal refactor, doc-only | patch (`1.0.0 -> 1.0.1`) |
| New export, new optional field, new entry point | minor (`1.0.0 -> 1.1.0`) |
| Renaming/removing an export, signature change, snapshot schema change, CLI flag removal | major (`1.0.0 -> 2.0.0`) |

### 5.3 Deprecation policy

Breaking a public API requires:

1. **Announce** the deprecation in a minor release of the current major: add `@deprecated` JSDoc on the export.
2. **Ship** the deprecated API for at least one further minor of the same major. Consumers must always have a non-deprecated path.
3. **Remove** only in the next major release, accompanied by a `MIGRATING.md` with a migration recipe.

Security-driven exceptions ship in the next patch across all supported majors with a `### Security` CHANGELOG entry.

### 5.4 License and provenance invariants

- License stays Apache-2.0 within a major.
- `NOTICE` is preserved verbatim in the tarball.
- Every release is published with `--provenance` (SLSA attestation by GitHub Actions). Consumers can verify via `npm view @takk/bayestruth@<version> --json | jq .dist.attestations`.

---

## 6. Runtime expectations

- BayesTruth is a library; it does not call out to any service at import time and makes no outbound network calls of its own.
- All inference is synchronous and deterministic. The only asynchronous surface is the audit seal and verify, which await the Web Crypto digest.
- The correlated-failure guard and time-decay are opt-in. With both off, behavior is pure i.i.d. Beta-Bernoulli.
- Bandit selection is seeded and reproducible by default.

---

## 7. Test surface

- Unit tests for every module: the special functions, the seeded RNG, the Beta distribution, trust scoring, the bandit, decay, the store, the policy, the audit chain, the interceptors, the MCP bridge, calibration, pooling, the file store, the facade, and the CLI.
- A distribution smoke test that exercises the compiled ESM and CJS artifacts and spawns the compiled CLI as a single Node process.

Coverage thresholds enforced via `vitest.config.ts`: `lines >= 80`, `functions >= 80`, `statements >= 80`, `branches >= 60`. Current run (1.0.0): `statements 97.48%, branches 93.55%, functions 100%, lines 97.39%`, with 170 tests across 20 suites.

---

## 8. Non-goals (in 1.0)

- Persistence backends for Redis, SQLite, or Postgres (implement the `PosteriorStore` interface; reference adapters planned for a later release).
- Native framework integrations for Vercel AI SDK, OpenAI Agents SDK, Mastra, or LangChain JS (planned, the MCP bridge ships today).
- Signed and timestamped audit seals (the current seal is integrity-only).
- Multi-level hierarchical pooling across categories of categories (single-level pooling ships today).
- A hosted observability dashboard and a federated trust network (separate products).
