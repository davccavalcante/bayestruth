/**
 * Shared types for @takk/bayestruth.
 *
 * BayesTruth is exact Bayesian inference, not a heuristic. Every subject (a tool, an MCP server, a
 * skill, an agent) carries a Beta posterior over its success rate. Each call is a Bernoulli trial;
 * the conjugate update is closed-form, so a trust score is a calibrated posterior mean with a
 * credible interval that respects the sample size. Every type here describes that posterior, the
 * evidence you feed it, or what BayesTruth returns.
 *
 * @packageDocumentation
 */

/** A clock returning epoch milliseconds. Inject one to keep audit timestamps and decay testable. */
export type Clock = () => number;

/** A Beta(alpha, beta) posterior. Both shape parameters must be strictly positive. */
export interface Posterior {
  readonly alpha: number;
  readonly beta: number;
}

/** A prior is the initial Beta posterior, the pseudo-counts before any evidence. */
export type Prior = Posterior;

/** The outcome of a single Bernoulli trial. */
export type Outcome = 'success' | 'failure';

/** An equal-tailed Bayesian credible interval over a success rate. */
export interface CredibleInterval {
  readonly lower: number;
  readonly upper: number;
  /** The mass inside the interval, for example 0.95. */
  readonly level: number;
}

/** A calibrated trust summary derived from a subject's posterior. */
export interface TrustScore {
  readonly subject: string;
  /** Posterior mean, `alpha / (alpha + beta)`. The point trust estimate. */
  readonly score: number;
  /** Posterior mode, defined only when both shape parameters exceed 1. */
  readonly mode?: number;
  /** Posterior standard deviation. */
  readonly stddev: number;
  /** Equal-tailed credible interval at the configured level. */
  readonly interval: CredibleInterval;
  /** Observed successes folded into the posterior beyond the prior. */
  readonly successes: number;
  /** Observed failures folded into the posterior beyond the prior. */
  readonly failures: number;
  /** Total observed trials, `successes + failures`. */
  readonly samples: number;
  readonly posterior: Posterior;
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/** Options for time-decay of evidence, so old observations weigh less than recent ones. */
export interface DecayOptions {
  /**
   * Multiplicative retention per `halfLifeMs`, in (0, 1]. At each decay step the pseudo-counts above
   * the prior are scaled toward the prior. A `halfLife` decay keeps half the accumulated evidence.
   */
  readonly halfLifeMs: number;
  /** The prior the decayed posterior relaxes back toward. Defaults to the scorer's prior. */
  readonly prior?: Prior;
}

// ---------------------------------------------------------------------------
// Bandit
// ---------------------------------------------------------------------------

/** Result of a Thompson-sampling selection across competing subjects. */
export interface BanditChoice {
  /** The selected subject. */
  readonly subject: string;
  /** The Beta draw that won the round, per subject, for transparency. */
  readonly draws: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** One persisted subject record: its posterior plus observed counts. */
export interface SubjectRecord {
  readonly subject: string;
  readonly posterior: Posterior;
  readonly successes: number;
  readonly failures: number;
  /** Epoch milliseconds of the last observation, for decay. */
  readonly lastObservedAt: number;
}

/** A portable snapshot of an entire trust store. */
export interface StoreSnapshot {
  readonly version: 1;
  readonly subjects: ReadonlyArray<SubjectRecord>;
}

/** A pluggable posterior store. The default is in-process memory. */
export interface PosteriorStore {
  get(subject: string): SubjectRecord | undefined;
  set(record: SubjectRecord): void;
  keys(): ReadonlyArray<string>;
  snapshot(): StoreSnapshot;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** A decision a policy can return about a subject. */
export type TrustDecision = 'trust' | 'monitor' | 'distrust';

/** Thresholds for a calibrated trust policy. */
export interface TrustPolicy {
  /** A subject is `trust` when the credible-interval lower bound is at or above this. */
  readonly trustLower: number;
  /** A subject is `distrust` when the posterior mean is below this. */
  readonly distrustMean: number;
  /** Minimum samples before a non-`monitor` decision is allowed. */
  readonly minSamples: number;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** The category of an audit entry. */
export type AuditEventType = 'observation' | 'decision' | 'selection' | 'note';

/** One append-only audit record. The hash chain is computed by sealing, not stored per entry. */
export interface AuditEntry {
  readonly seq: number;
  readonly at: number;
  readonly type: AuditEventType;
  readonly summary: string;
  readonly data?: unknown;
}

/** An append-only audit log. */
export interface AuditLog {
  readonly id: string;
  readonly entries: ReadonlyArray<AuditEntry>;
}

/** A tamper-evident seal over an {@link AuditLog}, a SHA-256 hash-chain root. */
export interface AuditSeal {
  readonly algorithm: 'sha-256';
  readonly root: string;
  readonly count: number;
}

/** Result of {@link verifyAuditLog}. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly brokenAt?: number;
}
