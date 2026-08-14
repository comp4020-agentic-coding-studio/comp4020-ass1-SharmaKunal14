// One frozen configuration object is the whole experiment. Baseline and
// treatment are the *same* config run twice; the only permitted difference is
// whether the connector is on offer. There is deliberately no second scenario
// object anywhere in this project, because two objects meant to match drift.

import type { Network } from "../sim/network.ts";
import { buildNetwork, linkCapacity } from "../sim/network.ts";
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
  /** logit sensitivity, 1/s */
  readonly theta: number;
  /** how fast a driver's estimate moves towards what it just experienced */
  readonly alpha: number;
  readonly geometry: {
    readonly streetLength: number;
    readonly parkwayLength: number;
    readonly connectorLength: number;
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
  v0Sd: 0.1,
  v0Min: 0.8,
  v0Max: 1.2,
  TSd: 0.15,
  TMin: 0.7,
  TMax: 1.4,
});

const GEOMETRY = Object.freeze({
  streetLength: 1800,
  parkwayLength: 5600,
  connectorLength: 600,
});

const BASE = {
  dt: 0.25,
  warmup: 400,
  window: 800,
  drain: 700,
  theta: 0.04,
  alpha: 0.3,
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
  demandPerHour: 1000,
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
  demandPerHour: 520,
});

export function horizonOf(config: ExperimentConfig): number {
  return config.warmup + config.window + config.drain;
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
  const capacity = linkCapacity(
    network.links.SA,
    IDM_TABLE_I.s0,
    IDM_TABLE_I.vehicleLength,
  );
  return config.demandPerHour / 3600 / capacity;
}

/**
 * The driver population and its departure schedule, generated once from the
 * seed. Crucially this does not depend on whether the connector is open, so
 * both configurations get a literally identical population — including each
 * driver's route-choice draw, so the same driver decides from the same random
 * number either way.
 */
export function buildSchedule(config: ExperimentConfig): readonly ScheduledDeparture[] {
  const rand = mulberry32(config.seed);
  const rate = config.demandPerHour / 3600;
  const horizon = horizonOf(config);
  const schedule: ScheduledDeparture[] = [];

  let t = 0;
  let id = 0;
  while (t < horizon) {
    t += exponential(rand, rate);
    if (t >= horizon) break;
    schedule.push({
      id,
      departTime: t,
      v0Factor: clippedNormal(
        rand,
        1,
        config.driver.v0Sd,
        config.driver.v0Min,
        config.driver.v0Max,
      ),
      TFactor: clippedNormal(rand, 1, config.driver.TSd, config.driver.TMin, config.driver.TMax),
      routeDraw: rand(),
    });
    id += 1;
  }
  return Object.freeze(schedule);
}
