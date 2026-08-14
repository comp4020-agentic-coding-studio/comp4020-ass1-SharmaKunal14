// Drives the simulation for the page: the same engine and the same frozen config
// the headless experiment uses, advanced in fixed timesteps from an accumulator.
//
// Never integrate with a frame delta. A `requestAnimationFrame` delta makes the
// timestep a function of frame rate, which makes the experiment a function of the
// machine it is watched on — a slow phone would get different physics from a fast
// desktop. The accumulator converts wall time into a whole number of fixed steps
// and carries the remainder.

import { Simulation } from "./sim/engine.ts";
import type { LinkId, RouteId } from "./sim/network.ts";

import type { ExperimentConfig } from "./experiment/config.ts";
import { buildSchedule, networkOf } from "./experiment/config.ts";
import { meanOf } from "./experiment/metrics.ts";
import { EXPERIMENT } from "./experiment/result.generated.ts";

/** How many simulated seconds pass per second of wall clock. Disclosed on page. */
export const TIME_SCALE = 45;

/**
 * Bounds for an overridden time scale. Raising it compresses wall time only: the
 * timestep, the seed, the schedule and every simulated second are unchanged, so a
 * test can watch the same 900 simulated seconds of adaptation in a fraction of the
 * wall time and still be watching the same run.
 */
export const MIN_TIME_SCALE = 1;
export const MAX_TIME_SCALE = 800;

/** Trips averaged for the live readout. Enough that the shift clears the noise. */
export const WINDOW_TRIPS = 60;

/** Longest single frame we will simulate, so a backgrounded tab cannot stall. */
const MAX_FRAME_SECONDS = 0.25;

export type Marker = { readonly simTime: number; readonly kind: "opened" | "closed" };

export type Sample = {
  readonly simTime: number;
  readonly mean: number;
  readonly shortcutShare: number;
};

/** Two consecutive stretches of a series that agree: the adjustment is over. */
function settled(series: readonly number[], tolerance: number): boolean {
  if (series.length < 8) return false;
  const recent = meanOf(series.slice(-4));
  const earlier = meanOf(series.slice(-8, -4));
  return Math.abs(recent - earlier) / earlier <= tolerance;
}

export class LiveRun {
  readonly config: ExperimentConfig;
  readonly timeScale: number;
  private readonly sim: Simulation;
  private accumulator = 0;
  private arrivalCursor = 0;
  private traversalCursor = 0;
  private readonly recentTrips: { time: number; route: RouteId }[] = [];
  private readonly recentLink: Record<LinkId, number[]> = {
    SA: [],
    AT: [],
    SB: [],
    BT: [],
    AB: [],
  };
  private lastSampleAt = -Infinity;
  private anchor = 0;
  private anchorSum = 0;
  private anchorCount = 0;
  private anchorByRoute: Record<RouteId, { sum: number; count: number }> = {
    north: { sum: 0, count: 0 },
    south: { sum: 0, count: 0 },
    shortcut: { sum: 0, count: 0 },
  };

  readonly samples: Sample[] = [];
  readonly markers: Marker[] = [];

  constructor(config: ExperimentConfig, timeScale: number = TIME_SCALE) {
    this.config = config;
    this.timeScale = Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, timeScale));
    this.sim = new Simulation({
      network: networkOf(config),
      schedule: buildSchedule(config),
      dt: config.dt,
      theta: config.theta,
      alpha: config.alpha,
      connectorOpen: false,
      origin: "S",
      destination: "T",
    });
  }

  get simTime(): number {
    return this.sim.t;
  }

  get connectorOpen(): boolean {
    return this.sim.connectorOpen;
  }

  get activeCount(): number {
    return this.sim.activeCount + this.sim.waitingCount;
  }

  get completedTrips(): number {
    return this.sim.arrivals.length;
  }

  vehiclesOn(link: LinkId): ReturnType<Simulation["vehiclesOn"]> {
    return this.sim.vehiclesOn(link);
  }

  setConnectorOpen(open: boolean): void {
    if (open === this.sim.connectorOpen) return;
    this.sim.setConnectorOpen(open);
    this.markers.push({ simTime: this.sim.t, kind: open ? "opened" : "closed" });
  }

  /**
   * Advance by a wall-clock duration. Steps are always exactly `config.dt`; the
   * leftover is carried, so no simulated time is invented or lost. The cap stops
   * a backgrounded tab from returning and running thousands of steps in one
   * frame — it deliberately drops simulated time rather than freezing the page.
   */
  advance(wallSeconds: number): void {
    this.runFor(Math.min(wallSeconds, MAX_FRAME_SECONDS) * this.timeScale);
  }

  /**
   * Advance by simulated seconds, uncapped. Separate from `advance` on purpose:
   * the frame cap there exists to survive a backgrounded tab, and applying it to
   * a deliberate fast-forward silently truncated a 900-second warm-up to six
   * seconds, so the page opened on an empty network with no average to show.
   */
  advanceSimulated(simSeconds: number): void {
    this.runFor(simSeconds);
  }

  private runFor(simSeconds: number): void {
    this.accumulator += simSeconds;
    let steps = Math.floor(this.accumulator / this.config.dt);
    this.accumulator -= steps * this.config.dt;
    while (steps > 0) {
      this.sim.step();
      steps -= 1;
    }
    this.drain();
    this.maybeSample();
  }

  /**
   * Start a fresh running average from this moment: "the average commute since you
   * built it".
   *
   * The headline number used to be a rolling average of the last N arrivals, and
   * that was a mistake. Route learning genuinely oscillates — day-to-day route
   * choice does — so a short rolling window swings, and a visitor could easily
   * catch it at a moment that read level with the baseline while the page claimed
   * it had got worse. A running average over everyone who has departed since the
   * decision cannot swing back: it converges, and it is exactly the quantity a
   * resident would notice. The oscillation is still shown, honestly, in the chart.
   */
  setAnchor(simTime: number): void {
    this.anchor = simTime;
    this.anchorSum = 0;
    this.anchorCount = 0;
    this.anchorByRoute = {
      north: { sum: 0, count: 0 },
      south: { sum: 0, count: 0 },
      shortcut: { sum: 0, count: 0 },
    };
  }

  /**
   * Mean time for one route since the last anchor.
   *
   * This is what lets the page make the claim that matters: at the new equilibrium
   * the drivers who never changed route are slower too. Without it, "everyone got
   * home later" is an assertion about an average rather than about everyone.
   */
  meanSinceAnchorFor(route: RouteId): number {
    const bucket = this.anchorByRoute[route];
    return bucket.count === 0 ? Number.NaN : bucket.sum / bucket.count;
  }

  tripsSinceAnchorFor(route: RouteId): number {
    return this.anchorByRoute[route].count;
  }

  /** Mean door-to-door time of everyone who departed since the last anchor. */
  meanSinceAnchor(): number {
    return this.anchorCount === 0 ? Number.NaN : this.anchorSum / this.anchorCount;
  }

  get anchoredTrips(): number {
    return this.anchorCount;
  }

  /** Pull whatever the engine has produced since last time into rolling windows. */
  private drain(): void {
    const arrivals = this.sim.arrivals;
    for (; this.arrivalCursor < arrivals.length; this.arrivalCursor += 1) {
      const arrival = arrivals[this.arrivalCursor];
      this.recentTrips.push({ time: arrival.travelTime, route: arrival.routeId });
      if (this.recentTrips.length > WINDOW_TRIPS) this.recentTrips.shift();
      if (arrival.departTime >= this.anchor) {
        this.anchorSum += arrival.travelTime;
        this.anchorCount += 1;
        const bucket = this.anchorByRoute[arrival.routeId];
        bucket.sum += arrival.travelTime;
        bucket.count += 1;
      }
    }
    const traversals = this.sim.traversals;
    for (; this.traversalCursor < traversals.length; this.traversalCursor += 1) {
      const traversal = traversals[this.traversalCursor];
      const bucket = this.recentLink[traversal.link];
      bucket.push(traversal.seconds);
      if (bucket.length > 40) bucket.shift();
    }
  }

  private maybeSample(): void {
    if (this.sim.t - this.lastSampleAt < 15) return;
    this.lastSampleAt = this.sim.t;
    if (this.recentTrips.length < 12) return;
    this.samples.push({
      simTime: this.sim.t,
      mean: this.meanTravelTime(),
      shortcutShare: this.shareOf("shortcut"),
    });
  }

  /** Mean door-to-door time over the most recent completed trips. */
  meanTravelTime(): number {
    return meanOf(this.recentTrips.map((trip) => trip.time));
  }

  get sampleCount(): number {
    return this.recentTrips.length;
  }

  shareOf(route: RouteId): number {
    if (this.recentTrips.length === 0) return 0;
    return this.recentTrips.filter((trip) => trip.route === route).length / this.recentTrips.length;
  }

  /**
   * Has the network re-settled since a given moment?
   *
   * The page used to reveal its verdict after a fixed countdown, and that was
   * wrong: the readout can only know a trip's duration once the trip has
   * finished, so it lags departures by a whole journey. Timed at real speed, the
   * verdict fired while the average still reflected the first few drivers to try
   * the link — who genuinely did get home sooner. The reveal landed on a number
   * that had not moved yet, or had moved the wrong way.
   *
   * So the page now waits for the same thing the harness waits for: two
   * consecutive stretches of the rolling average that agree. Compare the last
   * four samples with the four before them; if they agree, the adjustment is
   * over and there is something true to say.
   */
  hasSettledSince(simTime: number, tolerance = 0.02): boolean {
    const since = this.samples.filter((sample) => sample.simTime > simTime);
    return settled(since.map((sample) => sample.mean), tolerance);
  }

  /** The same test over the most recent samples, whenever the anchor was set. */
  hasSettledAcrossWindow(tolerance = 0.02): boolean {
    return settled(this.samples.map((sample) => sample.mean), tolerance);
  }

  /**
   * How much slower a road is running than when it is empty. 1 means free
   * flowing. This is what makes the bottleneck legible as a *place*: the two
   * streets climb while the parkways stay at 1, and the connector — the new road
   * itself — stays at 1 throughout.
   */
  congestionOf(link: LinkId): number {
    const recent = this.recentLink[link];
    if (recent.length < 4) return 1;
    // Measured on a near-empty network, not length ÷ speed limit: without
    // overtaking, a long road's mean time exceeds free flow even when deserted,
    // and using free flow made the empty ring roads report "slowing".
    const reference = EXPERIMENT.uncongested[link as keyof typeof EXPERIMENT.uncongested];
    return Math.max(1, meanOf(recent) / reference);
  }
}
