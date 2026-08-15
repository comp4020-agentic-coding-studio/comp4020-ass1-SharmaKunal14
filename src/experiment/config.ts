// One frozen configuration object is the whole experiment. Baseline and
// treatment are the *same* config run twice; the only permitted difference is
// whether the connector is on offer. There is deliberately no second scenario
// object anywhere in this project, because two objects meant to match drift.

import type { Network, ThroatSpec } from "../sim/network.ts";
import { buildNetwork, DEFAULT_THROAT, linkNarrowestCapacity } from "../sim/network.ts";
import { IDM_TABLE_I } from "../sim/idm.ts";
import { clippedNormal, exponential, mulberry32 } from "../sim/rng.ts";
import type { ScheduledDeparture } from "../sim/engine.ts";

export type ExperimentConfig = {
  readonly label: string;
  readonly seed: number;
  /** vehicles per hour wanting to go from S to T */
  readonly demandPerHour: number;
  /** seconds — fixed simulation timestep */
  readonly dt: number;
  /** seconds of settling discarded before measurement begins */
  readonly warmup: number;
  /** seconds — departures inside this window form the measured cohort */
  readonly window: number;
  /** seconds of extra running so the whole cohort can finish */
  readonly drain: number;
  /**
   * seconds allowed for drivers to re-learn after the connector opens, before the
   * second measurement window starts. Measured, not guessed: the live run's
   * rolling average stopped moving about 2,600 simulated seconds after the switch.
   */
  readonly adapt: number;
  /** logit sensitivity, 1/s */
  readonly theta: number;
  /** how fast a driver's estimate moves towards what it just experienced */
  readonly alpha: number;
  readonly geometry: {
    readonly streetLength: number;
    readonly parkwayLength: number;
    readonly connectorLength: number;
    readonly throat: ThroatSpec;
  };
  readonly driver: {
    readonly v0Sd: number;
    readonly v0Min: number;
    readonly v0Max: number;
    readonly TSd: number;
    readonly TMin: number;
    readonly TMax: number;
  };
};

/**
 * The heterogeneity below is not decoration. A deterministic car-following model
 * with evenly spaced departures runs at free-flow speed right up to capacity and
 * then queues without bound — a step, not the smoothly rising travel time the
 * paradox needs. Real travel time rises well before nominal capacity because
 * arrivals are bursty and drivers differ, so those are the two things we model,
 * and both stay reproducible because both come from the seed.
 */
const DRIVER_SPREAD = Object.freeze({
  v0Sd: 0.05,
  v0Min: 0.9,
  v0Max: 1.1,
  TSd: 0.08,
  TMin: 0.85,
  TMax: 1.2,
});

const GEOMETRY = Object.freeze({
  streetLength: 1800,
  parkwayLength: 5600,
  connectorLength: 600,
  throat: DEFAULT_THROAT,
});

const BASE = {
  dt: 0.25,
  warmup: 900,
  window: 1200,
  drain: 1200,
  adapt: 3000,
  theta: 0.015,
  alpha: 0.06,
  geometry: GEOMETRY,
  driver: DRIVER_SPREAD,
} as const;

/**
 * The configuration the page shows: demand high enough that a street carrying
 * everyone runs close to capacity, so opening the connector moves the
 * equilibrium the wrong way.
 */
export const TARGET: ExperimentConfig = Object.freeze({
  ...BASE,
  label: "target",
  seed: 20260817,
  demandPerHour: 860,
});

/**
 * The control. Same engine, same topology, same code path — only the demand is
 * lower, and here the connector *helps*. This is the load-bearing evidence that
 * `new road → worse traffic` is not a rule written into the simulation. If this
 * ever starts producing the Braess outcome too, the engine has begun
 * hard-coding the answer and the engine is what needs fixing.
 */
export const CONTROL: ExperimentConfig = Object.freeze({
  ...BASE,
  label: "control",
  seed: 20260817,
  demandPerHour: 300,
});

/** How long the two-run comparison needs to run. */
export function horizonOf(config: ExperimentConfig): number {
  return config.warmup + config.window + config.drain;
}

/**
 * How long the warm-start intervention needs: settle closed, measure, open the
 * connector, let drivers re-learn, measure again, drain.
 */
export function interventionHorizonOf(config: ExperimentConfig): number {
  return config.warmup + config.window + config.adapt + config.window + config.drain;
}

export function networkOf(config: ExperimentConfig): Network {
  return buildNetwork(config.geometry);
}

/**
 * Highest demand any single link would have to carry, as a fraction of that
 * link's capacity, if every driver used the shortcut. Above 1 the queue grows
 * without bound and no run can report an equilibrium — so this is checked, not
 * hoped for.
 */
export function worstCaseLoad(config: ExperimentConfig): number {
  const network = networkOf(config);
  const capacity = linkNarrowestCapacity(
    network.links.SA,
    IDM_TABLE_I.s0,
    IDM_TABLE_I.vehicleLength,
  );
  return config.demandPerHour / 3600 / capacity;
}

/**
 * A finite driver population and departure schedule for a headless protocol,
 * generated once from the seed. Crucially this does not depend on whether the
 * connector is open, so both configurations get a literally identical
 * population — including each driver's route-choice draw, so the same driver
 * decides from the same random number either way.
 */
export type DepartureScheduleStream = {
  /** A stable array reference. Extending the stream appends to this array. */
  readonly departures: readonly ScheduledDeparture[];
  /** Generate the deterministic schedule prefix ending before `horizon`. */
  extendUntil(horizon: number): void;
};

/**
 * A seeded schedule that can grow without changing any prefix already produced.
 *
 * Headless experiments freeze a finite prefix with `buildSchedule`. The live page
 * keeps this stream and extends it ahead of simulated time, so leaving the page at
 * a decision for several minutes cannot silently exhaust demand and empty the map.
 */
export function createScheduleStream(config: ExperimentConfig): DepartureScheduleStream {
  const rand = mulberry32(config.seed);
  const rate = config.demandPerHour / 3600;
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError("demandPerHour must produce a finite positive departure rate");
  }

  const departures: ScheduledDeparture[] = [];
  let nextDepartTime = exponential(rand, rate);
  let nextId = 0;

  return {
    departures,
    extendUntil(horizon: number): void {
      if (!Number.isFinite(horizon) || horizon < 0) {
        throw new RangeError("schedule horizon must be a finite non-negative number");
      }

      while (nextDepartTime < horizon) {
        departures.push({
          id: nextId,
          departTime: nextDepartTime,
          v0Factor: clippedNormal(
            rand,
            1,
            config.driver.v0Sd,
            config.driver.v0Min,
            config.driver.v0Max,
          ),
          TFactor: clippedNormal(
            rand,
            1,
            config.driver.TSd,
            config.driver.TMin,
            config.driver.TMax,
          ),
          routeDraw: rand(),
        });
        nextId += 1;
        nextDepartTime += exponential(rand, rate);
      }
    },
  };
}

export function buildSchedule(
  config: ExperimentConfig,
  horizon = Math.max(horizonOf(config), interventionHorizonOf(config)),
): readonly ScheduledDeparture[] {
  const stream = createScheduleStream(config);
  stream.extendUntil(horizon);
  return Object.freeze([...stream.departures]);
}
