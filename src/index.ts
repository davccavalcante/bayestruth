/**
 * @takk/bayestruth, exact Bayesian trust scoring for tools, MCP servers, skills, and agents.
 *
 * Every subject carries a Beta posterior over its success rate. Each observed call is a Bernoulli
 * trial folded in with the closed-form conjugate update, so a trust score is a calibrated posterior
 * mean with a credible interval that respects how much evidence you actually have. This module is the
 * facade: it wires the posterior store, the scorer, optional time-decay, the Thompson-sampling bandit,
 * decision policies, and the tamper-evident audit log into one object. Every submodule is also a
 * standalone entry point for callers who want only the math.
 *
 * @example
 * ```ts
 * import { createBayesTruth } from '@takk/bayestruth';
 *
 * const trust = createBayesTruth();
 * trust.observe('search-api', 'success');
 * trust.observe('search-api', 'failure');
 * const score = trust.score('search-api');
 * console.log(score.score, score.interval.lower, score.interval.upper);
 * ```
 *
 * @packageDocumentation
 */

import { type AuditLogger, createAuditLog } from './audit/index.js';
import { type Bandit, createBandit } from './bandit/index.js';
import { UNIFORM_PRIOR } from './beta/index.js';
import { decayRecord } from './decay/index.js';
import type { Observation, OutcomeSink } from './interceptors/index.js';
import { DEFAULT_TRUST_POLICY, decideTrust } from './policy/index.js';
import { createMemoryStore, decodeStore } from './store/index.js';
import {
  initialRecord,
  observeRecord,
  type RankBy,
  rankScores,
  scoreRecord,
} from './trust/index.js';
import type {
  AuditLog,
  AuditSeal,
  BanditChoice,
  Clock,
  CredibleInterval,
  DecayOptions,
  Outcome,
  Posterior,
  PosteriorStore,
  Prior,
  StoreSnapshot,
  SubjectRecord,
  TrustDecision,
  TrustPolicy,
  TrustScore,
  VerifyResult,
} from './types.js';

export {
  type AuditLogger,
  type CreateAuditLogOptions,
  createAuditLog,
  sealAuditLog,
  verifyAuditLog,
} from './audit/index.js';
export { type Bandit, createBandit, thompsonSelect } from './bandit/index.js';
export {
  assertPosterior,
  betaCdf,
  betaMean,
  betaMode,
  betaPdf,
  betaQuantileOf,
  betaStddev,
  betaVariance,
  credibleInterval,
  DEFAULT_CREDIBLE_LEVEL,
  JEFFREYS_PRIOR,
  sampleFrom,
  UNIFORM_PRIOR,
  update,
  updateBatch,
} from './beta/index.js';
export {
  brierScore,
  type CalibrationReport,
  calibrationReport,
  expectedCalibrationError,
  logLoss,
  type Prediction,
  type ReliabilityBin,
  reliabilityBins,
} from './calibration/index.js';
export { type DecaySpec, decayFactor, decayRecord } from './decay/index.js';
export * from './errors.js';
export {
  createDeterministicClock,
  httpStatusIsSuccess,
  type Observation,
  type ObserveOptions,
  type OutcomeSink,
  observe,
  observeSync,
  type SuccessClassifier,
  wrap,
  wrapSync,
} from './interceptors/index.js';
export {
  DEFAULT_TRUST_POLICY,
  decideTrust,
  partition,
  type TrustPartition,
} from './policy/index.js';
export {
  fitCategoryPrior,
  type PooledCategory,
  poolCategory,
  pooledRecord,
  pooledScore,
} from './pool/index.js';
export {
  createMemoryStore,
  decodeStore,
  encodeStore,
  loadStore,
} from './store/index.js';
export {
  initialRecord,
  observeRecord,
  type RankBy,
  rankScores,
  scoreRecord,
} from './trust/index.js';
export * from './types.js';

/** Options for {@link createBayesTruth}. */
export interface BayesTruthOptions {
  /** Prior for new subjects. Defaults to the uniform Beta(1, 1). */
  readonly prior?: Prior;
  /** A custom posterior store. Defaults to in-memory. */
  readonly store?: PosteriorStore;
  /** Clock for observation timestamps, decay, and audit. Defaults to `Date.now`. */
  readonly clock?: Clock;
  /** Credible-interval level for scores. Defaults to 0.95. */
  readonly level?: number;
  /** Decision policy. Defaults to {@link DEFAULT_TRUST_POLICY}. */
  readonly policy?: TrustPolicy;
  /** Time-decay of evidence. Off by default. */
  readonly decay?: DecayOptions;
  /**
   * Correlated-failure guard. When set, a run of identical consecutive outcomes for a subject within
   * `windowMs` counts as a single event, so a burst (an outage producing many failures, or a hot path
   * producing many successes) is not mistaken for that many independent Bernoulli trials. Off by
   * default. This protects the calibration claim under the bursty, non-i.i.d. traffic of real tools.
   */
  readonly coalesce?: { readonly windowMs: number };
  /** Seed for the Thompson-sampling bandit, for reproducible selection. Defaults to 1. */
  readonly seed?: number;
  /** Record every observation, decision, and selection to a tamper-evident audit log. Off by default. */
  readonly audit?: boolean;
}

/** A fully wired BayesTruth instance. */
export interface BayesTruth {
  /** Fold one Bernoulli outcome into a subject and persist it. */
  observe(subject: string, outcome: Outcome | boolean): SubjectRecord;
  /** Fold a batch of successes and failures into a subject and persist it. */
  observeMany(subject: string, successes: number, failures: number): SubjectRecord;
  /** The current record for a subject, creating a fresh one from the prior if unseen. */
  record(subject: string): SubjectRecord;
  /** A calibrated trust score for a subject. */
  score(subject: string): TrustScore;
  /** Trust scores for every known subject. */
  scoreAll(): TrustScore[];
  /** The credible interval for a subject. */
  interval(subject: string, level?: number): CredibleInterval;
  /** The posterior for a subject. */
  posterior(subject: string): Posterior;
  /** A trust decision for a subject under the configured or supplied policy. */
  decide(subject: string, policy?: TrustPolicy): TrustDecision;
  /** Rank known subjects best-first, by the conservative lower bound by default. */
  rank(by?: RankBy): TrustScore[];
  /** Select one subject by Thompson sampling, across the given subjects or all known ones. */
  select(subjects?: ReadonlyArray<string>): BanditChoice;
  /** Every known subject name. */
  subjects(): string[];
  /** A portable snapshot of the whole store. */
  snapshot(): StoreSnapshot;
  /** Replace the store contents from a snapshot or its JSON encoding. */
  load(input: StoreSnapshot | string): void;
  /** A sink that feeds observations from interceptors and MCP wrappers into this instance. */
  readonly sink: OutcomeSink;
  /** The audit log, present only when `audit` was enabled. */
  auditLog(): AuditLog | undefined;
  /** Seal the audit log into a tamper-evident root. Throws when auditing is disabled. */
  seal(): Promise<AuditSeal>;
  /** Verify the audit log against a seal. Throws when auditing is disabled. */
  verify(seal: AuditSeal): Promise<VerifyResult>;
}

/** Create a BayesTruth instance with the given options. */
export function createBayesTruth(options: BayesTruthOptions = {}): BayesTruth {
  const prior: Prior = options.prior ?? UNIFORM_PRIOR;
  const clock: Clock = options.clock ?? Date.now;
  const level = options.level;
  const policy = options.policy ?? DEFAULT_TRUST_POLICY;
  const decay = options.decay;
  const bandit: Bandit = createBandit(options.seed ?? 1);
  const auditor: AuditLogger | undefined = options.audit ? createAuditLog({ clock }) : undefined;
  const coalesceWindowMs = options.coalesce?.windowMs;
  const lastCounted = new Map<string, { outcome: Outcome; at: number }>();
  let store: PosteriorStore = options.store ?? createMemoryStore();

  function decaySpec(): { halfLifeMs: number; prior: Prior } | undefined {
    return decay ? { halfLifeMs: decay.halfLifeMs, prior: decay.prior ?? prior } : undefined;
  }

  function stored(subject: string, at: number): SubjectRecord {
    return store.get(subject) ?? initialRecord(subject, prior, at);
  }

  /** The record viewed at the current time, with decay applied but not persisted. */
  function view(subject: string): SubjectRecord {
    const now = clock();
    const record = stored(subject, now);
    const spec = decaySpec();
    return spec ? decayRecord(record, now, spec) : record;
  }

  function normalize(outcome: Outcome | boolean): Outcome {
    return outcome === true || outcome === 'success' ? 'success' : 'failure';
  }

  /** Fold one outcome unconditionally (no coalescing). The batch path and the public observe share it. */
  function fold(subject: string, outcome: Outcome | boolean, now: number): SubjectRecord {
    const spec = decaySpec();
    const base = spec ? decayRecord(stored(subject, now), now, spec) : stored(subject, now);
    const next = observeRecord(base, outcome, now);
    store.set(next);
    auditor?.append('observation', `${subject}:${next.posterior.alpha}/${next.posterior.beta}`, {
      subject,
      outcome: normalize(outcome),
      posterior: next.posterior,
    });
    return next;
  }

  function observe(subject: string, outcome: Outcome | boolean): SubjectRecord {
    const now = clock();
    if (coalesceWindowMs !== undefined) {
      const current = normalize(outcome);
      const last = lastCounted.get(subject);
      if (last && last.outcome === current && now - last.at <= coalesceWindowMs) {
        // A run of identical outcomes inside the window is treated as one event, not as N independent
        // Bernoulli trials, so a single outage cannot crater trust or overstate confidence.
        auditor?.append('note', `${subject}:coalesced`, { subject, outcome: current });
        return view(subject);
      }
      const next = fold(subject, outcome, now);
      lastCounted.set(subject, { outcome: current, at: now });
      return next;
    }
    return fold(subject, outcome, now);
  }

  function score(subject: string): TrustScore {
    return scoreRecord(view(subject), level);
  }

  function decide(subject: string, override?: TrustPolicy): TrustDecision {
    const decision = decideTrust(score(subject), override ?? policy);
    auditor?.append('decision', `${subject}:${decision}`, { subject, decision });
    return decision;
  }

  function select(subjects?: ReadonlyArray<string>): BanditChoice {
    const names = subjects ?? store.keys();
    const records = names.map((name) => view(name));
    const choice = bandit.select(records);
    auditor?.append('selection', choice.subject, { subject: choice.subject, draws: choice.draws });
    return choice;
  }

  const sink: OutcomeSink = (observation: Observation) => {
    observe(observation.subject, observation.outcome);
  };

  return {
    observe,
    observeMany(subject, successes, failures) {
      // An explicit batch is deliberate evidence, never a burst, so it bypasses coalescing.
      let record = view(subject);
      for (let i = 0; i < successes; i += 1) {
        record = fold(subject, 'success', clock());
      }
      for (let i = 0; i < failures; i += 1) {
        record = fold(subject, 'failure', clock());
      }
      return record;
    },
    record: (subject) => view(subject),
    score,
    scoreAll: () => store.keys().map((subject) => score(subject)),
    interval: (subject, intervalLevel) =>
      scoreRecord(view(subject), intervalLevel ?? level).interval,
    posterior: (subject) => view(subject).posterior,
    decide,
    rank: (by) =>
      rankScores(
        store.keys().map((subject) => score(subject)),
        by,
      ),
    select,
    subjects: () => [...store.keys()],
    snapshot: () => store.snapshot(),
    load: (input) => {
      const snapshot = typeof input === 'string' ? decodeStore(input) : input;
      store = createMemoryStore(snapshot);
    },
    sink,
    auditLog: () => auditor?.log(),
    seal: async () => requireAuditor(auditor).seal(),
    verify: async (seal) => requireAuditor(auditor).verify(seal),
  };
}

function requireAuditor(auditor: AuditLogger | undefined): AuditLogger {
  if (!auditor) {
    throw new Error('audit is disabled; construct BayesTruth with { audit: true }');
  }
  return auditor;
}
