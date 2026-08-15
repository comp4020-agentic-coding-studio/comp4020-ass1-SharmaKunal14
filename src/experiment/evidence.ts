// Builds the evidence object checked into result.generated.ts.
//
// This lives outside scripts/snapshot.ts so a test can recompute the complete
// payload without importing a module that writes to disk. The browser imports
// only the generated data; none of these headless runs enter the shipped bundle.

import type { ExperimentConfig } from "./config.ts";
import { CONTROL, TARGET } from "./config.ts";
import { linkStats, meanOf, stdDevOf } from "./metrics.ts";
import type { Comparison, Intervention } from "./run.ts";
import { compare, horizonCheck, intervene, measureDecay, runExperiment } from "./run.ts";

export const EVIDENCE_SEED_ATTEMPTS = 10;
export const EVIDENCE_SEED_STRIDE = 7919;

export type SeedOutcome = {
  readonly deltaPercent: number;
  readonly usable: boolean;
};

/**
 * Statistics over valid runs, with attempted and excluded runs kept explicit.
 *
 * An unusable run has not established an equilibrium. Including its number in
 * the mean would contradict the gate that marked it inconclusive, so only usable
 * outcomes contribute to the aggregate and to `signHeld`.
 */
export type SeedSummary = {
  /** Legacy alias for `attempted`, retained for generated-data consumers. */
  readonly count: number;
  readonly attempted: number;
  readonly usable: number;
  readonly excluded: number;
  readonly meanPercent: number;
  readonly sdPercent: number;
  readonly minPercent: number;
  readonly maxPercent: number;
  /** Legacy alias for `usable`, retained for generated-data consumers. */
  readonly settled: number;
  /** Whether all usable outcomes have the same sign. */
  readonly signHeld: boolean;
  /** Whether every attempt had the same sign, including inconclusive attempts. */
  readonly attemptedSignHeld: boolean;
};

export function summariseSeedOutcomes(outcomes: readonly SeedOutcome[]): SeedSummary {
  const usable = outcomes.filter((outcome) => outcome.usable);
  if (usable.length === 0) {
    throw new Error("cannot aggregate seed evidence: no usable runs");
  }

  const usableDeltas = usable.map((outcome) => outcome.deltaPercent);
  const attemptedDeltas = outcomes.map((outcome) => outcome.deltaPercent);
  return {
    count: outcomes.length,
    attempted: outcomes.length,
    usable: usable.length,
    excluded: outcomes.length - usable.length,
    meanPercent: meanOf(usableDeltas),
    sdPercent: stdDevOf(usableDeltas),
    minPercent: Math.min(...usableDeltas),
    maxPercent: Math.max(...usableDeltas),
    settled: usable.length,
    signHeld: sameSign(usableDeltas),
    attemptedSignHeld: sameSign(attemptedDeltas),
  };
}

function sameSign(values: readonly number[]): boolean {
  return new Set(values.map((value) => Math.sign(value))).size === 1;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundedSeedSummary(summary: SeedSummary): SeedSummary {
  return {
    ...summary,
    meanPercent: round(summary.meanPercent),
    sdPercent: round(summary.sdPercent),
    minPercent: round(summary.minPercent),
    maxPercent: round(summary.maxPercent),
  };
}

function roundShares(shares: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(shares).map(([route, share]) => [route, Math.round(share * 100)]),
  );
}

function seedComparisons(config: ExperimentConfig, first: Comparison): readonly Comparison[] {
  const runs: Comparison[] = [first];
  for (let index = 1; index < EVIDENCE_SEED_ATTEMPTS; index += 1) {
    runs.push(compare({ ...config, seed: config.seed + index * EVIDENCE_SEED_STRIDE }));
  }
  return runs;
}

function summariseExperiment(config: ExperimentConfig) {
  const single = compare(config);
  if (!single.usable) {
    throw new Error(`${config.label} primary comparison is unusable`);
  }

  const horizon = horizonCheck(config);
  if (!horizon.ok) {
    throw new Error(`${config.label} primary comparison failed its horizon check: ${horizon.reason}`);
  }

  const seeds = roundedSeedSummary(
    summariseSeedOutcomes(
      seedComparisons(config, single).map((run) => ({
        deltaPercent: run.deltaPercent,
        usable: run.usable,
      })),
    ),
  );

  return {
    label: config.label,
    demandPerHour: config.demandPerHour,
    closedSeconds: round(single.closed.meanTravelTime),
    openSeconds: round(single.open.meanTravelTime),
    deltaSeconds: round(single.deltaSeconds),
    deltaPercent: round(single.deltaPercent),
    cohortSize: single.closed.cohortSize,
    routeCountsClosed: single.closed.routeCounts,
    routeCountsOpen: single.open.routeCounts,
    sharesClosed: roundShares(single.closed.shares),
    sharesOpen: roundShares(single.open.shares),
    horizonInvariant: horizon.ok,
    seeds,
  };
}

/** Measured traversal references for the visual road-state labels. */
function uncongestedReference(): Record<string, number> {
  const quietConfig = { ...TARGET, demandPerHour: 90 };
  const quiet = runExperiment(quietConfig, { connectorOpen: true });
  const reference: Record<string, number> = {};
  for (const id of ["SA", "AT", "SB", "BT", "AB"]) {
    reference[id] = round(linkStats(quiet.traversals, quietConfig, id).meanSeconds);
  }
  return reference;
}

function seedInterventions(
  config: ExperimentConfig,
  first: Intervention,
): readonly Intervention[] {
  const runs: Intervention[] = [first];
  for (let index = 1; index < EVIDENCE_SEED_ATTEMPTS; index += 1) {
    runs.push(intervene({ ...config, seed: config.seed + index * EVIDENCE_SEED_STRIDE }));
  }
  return runs;
}

/** The warm-start adjustment shown by the animation, kept separate from equilibrium evidence. */
function transientOf(config: ExperimentConfig) {
  const warm = intervene(config);
  if (!warm.usable) throw new Error(`${config.label} primary intervention is unusable`);

  const decay = measureDecay(config);
  const seeds = roundedSeedSummary(
    summariseSeedOutcomes(
      seedInterventions(config, warm).map((run) => ({
        deltaPercent: run.deltaPercent,
        usable: run.usable,
      })),
    ),
  );
  return {
    beforeSeconds: round(warm.before.meanTravelTime),
    afterSeconds: round(warm.after.meanTravelTime),
    deltaPercent: round(warm.deltaPercent),
    shortcutShare: Math.round(warm.after.shares.shortcut * 100),
    settledPercent: round(decay.longPercent),
    decaysToEquilibrium: !decay.ok,
    // Legacy scalar fields remain for callers written before seed disclosure was nested.
    seedMeanPercent: seeds.meanPercent,
    seedSignHeld: seeds.signHeld,
    seeds,
  };
}

/** Recompute every number the page is allowed to quote. */
export function buildEvidenceSnapshot() {
  return {
    seedStride: EVIDENCE_SEED_STRIDE,
    uncongested: uncongestedReference(),
    target: summariseExperiment(TARGET),
    control: summariseExperiment(CONTROL),
    transient: { target: transientOf(TARGET), control: transientOf(CONTROL) },
  };
}

export type EvidenceSnapshot = ReturnType<typeof buildEvidenceSnapshot>;
