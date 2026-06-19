# Privacy Notice, BayesTruth

This notice describes what data `@takk/bayestruth` processes when you install
and run it. BayesTruth is an npm library and CLI that runs entirely inside
your own process and infrastructure. The author (David C Cavalcante) hosts no
service, sees no traffic, and collects no telemetry.

Last updated: **2026-06-19**.

---

## 1. What BayesTruth is, and isn't

BayesTruth is a library you install and run in your own environment. There is
**no BayesTruth cloud**, no account, no sign-up. The author does not host any
endpoint that your installation talks to. BayesTruth makes **no outbound network
calls of its own**: it records the outcomes you report about your own tools and
computes a posterior from them. The dispatch of the underlying tool calls, and
any network traffic they produce, belongs entirely to your application.

---

## 2. Data BayesTruth processes (in your process)

### 2.1 Trust evidence (in memory)

You report outcomes with `trust.observe(subject, outcome)` or through the
observation hooks and the MCP interceptor. For each subject (a tool, MCP server,
skill, or agent identifier that **you** choose), BayesTruth holds in process
memory the Beta posterior shape parameters, the observed success and failure
counts, and the timestamp of the last observation. The subject identifiers are
strings you supply; BayesTruth does not interpret them.

### 2.2 In-memory store (default)

By default this state lives only in process memory and is discarded on exit. It
can be exported as a portable JSON snapshot with `snapshot()` and restored with
`load()`, entirely under your control.

### 2.3 Persisted store (only if you use the file store)

If you use `createFileStore(path)` from `@takk/bayestruth/node`, BayesTruth
writes the store to a JSON file at the path you specify.

**No secrets on disk.** The persisted record for each subject contains only the
subject identifier you chose, the posterior shape parameters, the observed
success and failure counts, and the last-observation timestamp. No API keys, no
request bodies, no response payloads are involved at any point, because
BayesTruth never sees them.

The store file is therefore not a credential, but it does reveal operational
metadata (which subjects you track and how reliable each has been). If your
subject identifiers themselves encode anything sensitive, that is your choice and
your responsibility. Treat the file according to your own threat model; a typical
project simply adds it to `.gitignore`.

### 2.4 Audit log (only if you enable it)

If you construct BayesTruth with `{ audit: true }`, each observation, decision,
and selection is recorded in an append-only log with an optional `data` payload.
Whatever you place in that payload is stored as you provide it. Do not put
secrets or personal data in audit entries unless your own policy permits it. The
log can be sealed and verified locally; it is never transmitted anywhere.

---

## 3. Data BayesTruth does NOT collect

- **No telemetry to the author.** BayesTruth makes zero outbound network calls to
  the author's infrastructure. Nothing leaves your process.
- **No analytics.** No usage statistics, no error reporting, no fingerprinting.
- **No third-party SDK that phones home.** BayesTruth has zero required runtime
  dependencies. Every `@takk` sibling is an optional peer you install explicitly.

---

## 4. GDPR and LGPD posture

BayesTruth processes subject identifiers and operational counters, not
end-user personal data. The outcomes you feed it are **your** data under
**your** control, and the library never persists request or response content
because it never receives any.

For operators in scope of **GDPR** or **LGPD**:

- **Minimisation**: BayesTruth persists only subject identifiers, posterior
  parameters, and operational counters, and only when you use the file store.
- **Right to erasure**: delete the store file to remove all persisted state.
- **Portability**: the store snapshot is plain JSON and portable by construction.

If you choose subject identifiers that contain personal data, that flow is
governed by your own privacy program, not by BayesTruth.

---

## 5. Security disclosure

See [`SECURITY.md`](./SECURITY.md) for vulnerability reports and the threat
model. The author can be reached at **davcavalcante@proton.me** (preferred) or
**say@takk.ag** (Takk relay) with the `[SECURITY]` prefix.

---

## 6. Children

BayesTruth is developer infrastructure with no user-facing surface and no
features directed at children. It is not intended for direct use by children
under 13.

---

## 7. Changes to this notice

This file is versioned in git alongside the code. Material changes are announced
in [`CHANGELOG.md`](./CHANGELOG.md) and in the next release notes on GitHub.

---

## 8. Contact

- General (author): **davcavalcante@proton.me**
- Takk relay: **say@takk.ag**
- LinkedIn: <https://linkedin.com/in/hellodav>
- Security: **davcavalcante@proton.me** (or **say@takk.ag**) with the
  `[SECURITY]` prefix (see [`SECURITY.md`](./SECURITY.md)).
