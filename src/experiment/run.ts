// The headless experiment runner. Produces the authoritative numbers, with no
// renderer involved and no wall clock — so the result cannot depend on a
// viewport, a frame rate, or how long anyone watched.

import { Simulation } from "../sim/engine.ts";
import type { Arrival, LinkTraversal } from "../sim/engine.ts";
import type { RouteId } from "../sim/network.ts";
import { routeShares } from "../sim/routing.ts";
import type { ExperimentConfig } from "./config.ts";
import { buildSchedule, horizonOf, networkOf, worstCaseLoad } from "./config.ts";
import { cohortOf, meanOf, steadyStateOf } from "./metrics.ts";
import type { SteadyState } from "./metrics.ts";

export type RunResult = {
  readonly config: ExperimentConfig;
  readonly connectorOpen: boolean;
  /** mean door-to-door time of the measured cohort, seconds */
  readonly meanTravelTime: number;
  readonly cohortSize: number;
  /** cohort members who never arrived — must be zero for a result to count */
  readonly unfinished: number;
  readonly steadyState: SteadyState;
  readonly shares: Record<RouteId, number>;
  readonly worstCaseLoad: number;
  /** every step is checked; anything here is a vehicle lost or duplicated */
  readonly conservationViolations: readonly string[];
  readonly physicsClamped: number;
  readonly beliefs: Record<RouteId, number>;
  readonly traversals: readonly LinkTraversal[];
  /** true only if this run may be quoted as an equilibrium */
  readonly usable: boolean;
};

export function runExperiment(
  config: ExperimentConfig,
  options: { readonly connectorOpen: boolean },
): RunResult {
  const network = networkOf(config);
  const schedule = buildSchedule(config);
  const horizon = horizonOf(config);
  const sim = new Simulation({
    network,
    schedule,
    dt: config.dt,
    theta: config.theta,
    alpha: config.alpha,
    connectorOpen: options.connectorOpen,
    origin: "S",
    destination: "T",
  });

  const violations: string[] = [];
  const steps = Math.round(horizon / config.dt);
  for (let i = 0; i < steps; i += 1) {
    sim.step();
    // Checked every step rather than at the end: a vehicle lost at step 12 and
    // a vehicle duplicated at step 900 cancel out in a final tally.
    const accounted = sim.activeCount + sim.arrivals.length + sim.waitingCount;
    if (accounted !== sim.dueCount) {
      violations.push(
        `t=${sim.t.toFixed(2)}: ${sim.dueCount} due but ${accounted} accounted for ` +
          `(active ${sim.activeCount}, arrived ${sim.arrivals.length}, waiting ${sim.waitingCount})`,
      );
      if (violations.length > 5) break;
    }
  }

  const cohort = cohortOf(sim.arrivals, config);
  const departedInWindow = schedule.filter(
    (d) => d.departTime >= config.warmup && d.departTime < config.warmup + config.window,
  ).length;
  const steadyState = steadyStateOf(cohort, config);
  const shares = sharesOfCohort(cohort);

  const unfinished = departedInWindow - cohort.length;
  return {
    config,
    connectorOpen: options.connectorOpen,
    meanTravelTime: meanOf(cohort.map((a) => a.travelTime)),
    cohortSize: cohort.length,
    unfinished,
    steadyState,
    shares,
    worstCaseLoad: worstCaseLoad(config),
    conservationViolations: violations,
    physicsClamped: sim.physicsClamped,
    beliefs: sim.beliefSnapshot(),
    traversals: sim.traversals,
    usable: violations.length === 0 && unfinished === 0 && steadyState.ok && cohort.length > 30,
  };
}

function sharesOfCohort(cohort: readonly Arrival[]): Record<RouteId, number> {
  const counts: Record<RouteId, number> = { north: 0, south: 0, shortcut: 0 };
  for (const arrival of cohort) counts[arrival.routeId] += 1;
  return routeShares(counts);
}

export type Comparison = {
  readonly closed: RunResult;
  readonly open: RunResult;
  /** positive means the connector made the average commute worse */
  readonly deltaSeconds: number;
  readonly deltaPercent: number;
  readonly braess: boolean;
  readonly usable: boolean;
};

/**
 * The controlled before/after. Both halves come from the same config object, so
 * demand, seed, driver population, departure schedule, timestep and
 * route-choice model are identical by construction rather than by inspection.
 */
export function compare(config: ExperimentConfig): Comparison {
  const closed = runExperiment(config, { connectorOpen: false });
  const open = runExperiment(config, { connectorOpen: true });
  const deltaSeconds = open.meanTravelTime - closed.meanTravelTime;
  return {
    closed,
    open,
    deltaSeconds,
    deltaPercent: (deltaSeconds / closed.meanTravelTime) * 100,
    braess: deltaSeconds > 0,
    usable: closed.usable && open.usable,
  };
}
