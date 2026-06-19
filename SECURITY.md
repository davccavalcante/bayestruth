# Security Policy

`@takk/bayestruth` is a stable (1.0.0) library for exact Bayesian trust and
reputation scoring of tools, MCP servers, skills, and agents. We take security
reports seriously and aim to acknowledge each one within two business days.

## Supported versions

Each published version follows strict SemVer (see [`SPEC.md`](./SPEC.md) and
[`.github/RELEASING.md`](./.github/RELEASING.md)). Only the latest minor of the
current major receives security patches; an older major receives critical-CVE
fixes for 6 months after the next major lands.

| Package | Supported |
|---|---|
| `@takk/bayestruth` | current `latest` dist-tag |

## Reporting a vulnerability

**Please do not file public GitHub issues for security problems.** Send reports
to **davcavalcante@proton.me** (preferred) or **say@takk.ag** (Takk relay),
with the subject line beginning `[SECURITY]`.

Include, at minimum:

- Affected version (`npm ls @takk/bayestruth`).
- Reproduction steps or a minimal proof-of-concept.
- Impact assessment (what an attacker can achieve).
- Any suggested mitigation.

If your report involves a vulnerability in a third-party peer dependency, please
also link the upstream advisory (CVE, GHSA, etc.) so we can coordinate the
disclosure.

PGP / signed reports are welcome but not required. If you need an out-of-band
channel, ask in the first message and we will propose one.

## Response process

1. Acknowledgement within **2 business days**.
2. Triage and severity assignment within **7 days**.
3. Fix targeted for the next release; critical issues ship as an out-of-band
   patch on the affected minor.
4. Coordinated disclosure: the reporter is credited in the changelog and
   advisory unless they request anonymity.

## Threat model in scope

Findings in any of the following are in scope:

- **Audit integrity.** Any way to make `verifyAuditLog` return `valid: true` for
  a log that was altered after sealing, any hash-chain construction that lets a
  forged entry pass, or any way to defeat the SHA-256 chaining. The seal is an
  integrity seal, not a signature: it proves a log was not altered after sealing,
  not who produced it, and that boundary is documented, not a vulnerability.
- **State persistence.** Path traversal in the `createFileStore` write path, or
  any way to make BayesTruth write outside the configured store file. The store
  persists subject names, posterior shape parameters, observed counts, and
  timestamps only. Any path that causes the file store to write outside its
  configured path, or to corrupt the on-disk snapshot of another file, is in
  scope.
- **Snapshot deserialization.** Any malicious store snapshot that bypasses
  `decodeStore` validation and yields an invalid Beta posterior, a non-finite
  count, or prototype pollution, so that a later decision runs on corrupted
  state.
- **Decision integrity.** Any way to drive a numerically invalid posterior
  (NaN or Infinity shape parameters) past `assertPosterior`, or any edge case in
  the conjugate update, decay, or correlated-failure guard that makes a
  distrusted subject report as trusted, or that produces a credible interval
  outside [0, 1].
- **Supply chain.** Tarball contamination, compromised npm scope, or a published
  artifact whose provenance attestation does not match the source commit.

## Out of scope

- The security or honesty of the upstream tools, MCP servers, skills, or agents
  you score; BayesTruth records the outcomes you report, it does not validate
  them.
- The correctness of the outcomes you feed it. Garbage evidence produces a
  garbage posterior; that is a usage concern, not a vulnerability.
- Statistical mis-modeling when the assumptions are violated (non-independent or
  non-stationary outcomes). The library documents these limits and ships decay
  and the correlated-failure guard as mitigations; a wide or shifting interval
  under violated assumptions is expected behavior, not a defect.
- Theoretical attacks against the cryptographic primitive used for the audit
  chain (SHA-256) and the Web Crypto implementation of the host runtime; report
  those upstream.

## Supply-chain assurances

- **Zero required runtime dependencies.** The attack surface from transitive
  dependencies is eliminated. Every `@takk` sibling is an optional peer
  dependency you install explicitly.
- **Node-free core.** The core, including the audit seal, uses the Web Crypto
  API rather than `node:crypto`. Only `@takk/bayestruth/node` touches the Node
  standard library.
- **Provenance.** Every release is published with `npm publish --provenance`
  (SLSA attestation by GitHub Actions). Verify with
  `npm view @takk/bayestruth@<version> --json | jq .dist.attestations`.
- **Lockfile committed.** `pnpm-lock.yaml` is tracked in git for reproducible
  installs.
