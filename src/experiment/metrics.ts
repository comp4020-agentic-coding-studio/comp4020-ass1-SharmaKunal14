// What we are allowed to claim from a run.

import type { Arrival, LinkTraversal } from "../sim/engine.ts";
import type { ExperimentConfig } from "./config.ts";

/**
 * The measured cohort: drivers who *departed* inside the measurement window,
 * counted when they arrive.
 *
 * Cohort by departure, not by arrival, on purpose. Averaging whoever happened to
 * finish inside a window lets a growing queue flatter its own average by
 * excluding the very drivers it delayed — the average improves as the jam gets
 * worse. Departure cohorts cannot do that: every member is counted or the run
 * is reported as unfinished.
 */
export function cohortOf(
  arrivals: readonly Arrival[],
  config: ExperimentConfig,
): readonly Arrival[] {
  const from = config.warmup;
  const to = config.warmup + config.window;
  return arrivals.filter((a) => a.departTime >= from && a.departTime < to);
}

export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdDevOf(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = meanOf(values);
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export type SteadyState = {
  readonly ok: boolean;
  readonly secondHalfMean: number;
  readonly lastQuarterMean: number;
  /** relative drift between the two, as a fraction */
  readonly drift: number;
  readonly tolerance: number;
  readonly reason: string;
};

/**
 * Has this run actually settled, or are we looking at a queue still growing?
 *
 * A run whose travel times are still climbing has no equilibrium to report, and
 * quoting its average would mean "worse" was really just "I watched for longer".
 * We compare the second half of the cohort with its last quarter: if the
 * equilibrium has settled those agree, and if the queue is growing they do not.
 */
export function steadyStateOf(
  cohort: readonly Arrival[],
  config: ExperimentConfig,
  tolerance = 0.06,
): SteadyState {
  if (cohort.length < 40) {
    return {
      ok: false,
      secondHalfMean: Number.NaN,
      lastQuarterMean: Number.NaN,
      drift: Number.NaN,
      tolerance,
      reason: `only ${cohort.length} completed trips in the cohort — too few to average`,
    };
  }

  const from = config.warmup;
  const span = config.window;
  const byDeparture = [...cohort].sort((a, b) => a.departTime - b.departTime);
  const secondHalf = byDeparture.filter((a) => a.departTime >= from + span / 2);
  const lastQuarter = byDeparture.filter((a) => a.departTime >= from + (3 * span) / 4);

  const secondHalfMean = meanOf(secondHalf.map((a) => a.travelTime));
  const lastQuarterMean = meanOf(lastQuarter.map((a) => a.travelTime));
  const drift = Math.abs(lastQuarterMean - secondHalfMean) / secondHalfMean;

  return {
    ok: drift <= tolerance,
    secondHalfMean,
    lastQuarterMean,
    drift,
    tolerance,
    reason:
      drift <= tolerance
        ? "settled"
        : `travel time still moving: last quarter ${lastQuarterMean.toFixed(1)}s vs ` +
          `second half ${secondHalfMean.toFixed(1)}s (${(drift * 100).toFixed(1)}% drift)`,
  };
}

export type LinkStats = {
  readonly link: string;
  readonly meanSeconds: number;
  readonly freeFlowRatio: number;
  readonly flowPerHour: number;
  readonly count: number;
};

/**
 * How long one road actually took, over the measurement window, and how much
 * traffic it carried. This is what attributes delay to a *road* rather than to
 * a route — the evidence for where the bottleneck is.
 */
export function linkStats(
  traversals: readonly LinkTraversal[],
  config: ExperimentConfig,
  link: string,
): LinkStats {
  const from = config.warmup;
  const to = config.warmup + config.window;
  const inWindow = traversals.filter(
    (x) => x.link === link && x.enteredAt >= from && x.enteredAt < to,
  );
  const seconds = inWindow.map((x) => x.seconds);
  return {
    link,
    meanSeconds: meanOf(seconds),
    freeFlowRatio: Number.NaN,
    flowPerHour: (inWindow.length / config.window) * 3600,
    count: inWindow.length,
  };
}

/** mm:ss, for the page. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
