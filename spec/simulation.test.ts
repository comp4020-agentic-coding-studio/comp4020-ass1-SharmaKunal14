// What has to stay true of the simulation, whatever the model does next.
//
// Every check here exists because a specific way of being wrong would otherwise
// ship looking perfectly plausible. Three of them already caught a wrong result
// during this build; see notes/log.md. None of them assert a particular number
// out of the model, because those change legitimately under calibration — they
// assert the properties a quotable result has to have.

import { describe, expect, it } from "vitest";
import { CONTROL, TARGET, buildSchedule, horizonOf, networkOf } from "../src/experiment/config.ts";
import type { ExperimentConfig } from "../src/experiment/config.ts";
import { compare, horizonCheck, runExperiment } from "../src/experiment/run.ts";
import { Simulation } from "../src/sim/engine.ts";
import type { ScheduledDeparture } from "../src/sim/engine.ts";
import { linkFreeFlowTime, routeFreeFlowTime } from "../src/sim/network.ts";
import { MAX_DECELERATION } from "../src/sim/idm.ts";

function simulationFor(
  config: ExperimentConfig,
  connectorOpen: boolean,
  schedule: readonly ScheduledDeparture[] = buildSchedule(config),
): Simulation {
  return new Simulation({
    network: networkOf(config),
    schedule,
    dt: config.dt,
    theta: config.theta,
    alpha: config.alpha,
    connectorOpen,
    origin: "S",
    destination: "T",
  });
}

describe("vehicles are conserved", () => {
  // A vehicle silently dropped at a node, or counted twice, changes every
  // average on the page while everything still looks like traffic.
  it("accounts for every departure at every step, in both configurations", () => {
    for (const connectorOpen of [false, true]) {
      const sim = simulationFor(TARGET, connectorOpen);
      const steps = Math.round(horizonOf(TARGET) / TARGET.dt);
      for (let i = 0; i < steps; i += 1) {
        sim.step();
        expect(
          sim.activeCount + sim.arrivals.length + sim.waitingCount,
          `t=${sim.t.toFixed(2)} connectorOpen=${connectorOpen}: vehicles lost or duplicated`,
        ).toBe(sim.dueCount);
      }
      expect(sim.arrivals.length).toBeGreaterThan(100);
    }
  });
});

describe("the experiment is reproducible", () => {
  it("gives bit-identical arrivals for the same config and seed", () => {
    const a = runExperiment(TARGET, { connectorOpen: true });
    const b = runExperiment(TARGET, { connectorOpen: true });
    expect(a.meanTravelTime).toBe(b.meanTravelTime);
    expect(a.cohortSize).toBe(b.cohortSize);
    expect(a.shares).toEqual(b.shares);
  });

  it("gives a different result for a different seed, so the seed is really used", () => {
    const a = runExperiment(TARGET, { connectorOpen: true });
    const b = runExperiment({ ...TARGET, seed: TARGET.seed + 1 }, { connectorOpen: true });
    expect(a.meanTravelTime).not.toBe(b.meanTravelTime);
  });

  it("uses no unseeded randomness: a fresh run reproduces after other runs have run", () => {
    const first = runExperiment(TARGET, { connectorOpen: true }).meanTravelTime;
    runExperiment(CONTROL, { connectorOpen: false });
    runExperiment({ ...TARGET, seed: 99 }, { connectorOpen: true });
    expect(runExperiment(TARGET, { connectorOpen: true }).meanTravelTime).toBe(first);
  });
});

describe("the before/after comparison is fair", () => {
  // The failure this prevents is the one the whole project turns on: a baseline
  // and a treatment that differ in some second thing nobody noticed.
  it("runs both halves from one config object, so they cannot drift apart", () => {
    const result = compare(TARGET);
    expect(result.closed.config).toBe(result.open.config);
    expect(result.closed.config).toBe(TARGET);
  });

  it("gives both halves an identical driver population and departure schedule", () => {
    // The schedule is a function of the config alone. If connector state ever
    // reaches it, the two halves stop being the same experiment.
    const schedule = buildSchedule(TARGET);
    expect(buildSchedule({ ...TARGET })).toEqual(schedule);
    for (const driver of schedule) {
      expect(driver.routeDraw).toBeGreaterThanOrEqual(0);
      expect(driver.routeDraw).toBeLessThan(1);
    }
    // Same drivers, same order, same pre-drawn route choices in both runs.
    const closed = simulationFor(TARGET, false, schedule);
    const open = simulationFor(TARGET, true, schedule);
    for (let i = 0; i < 400; i += 1) {
      closed.step();
      open.step();
    }
    expect(closed.dueCount).toBe(open.dueCount);
  });

  it("changes demand and nothing else between target and control", () => {
    const differing = (Object.keys(TARGET) as (keyof ExperimentConfig)[]).filter(
      (key) => JSON.stringify(TARGET[key]) !== JSON.stringify(CONTROL[key]),
    );
    expect([...differing].sort()).toEqual(["demandPerHour", "label"]);
  });
});

describe("the outcome is not hard-coded", () => {
  // If this pair ever agrees, the engine has started deciding the answer rather
  // than computing it. Fix the engine, never these tests.
  it("makes the connector worse in the target configuration", () => {
    const result = compare(TARGET);
    expect(result.usable, `target run unusable: ${result.closed.steadyState.reason}`).toBe(true);
    expect(result.deltaSeconds).toBeGreaterThan(0);
  });

  it("makes the connector better in the control configuration", () => {
    const result = compare(CONTROL);
    expect(result.usable, `control run unusable: ${result.closed.steadyState.reason}`).toBe(true);
    expect(result.deltaSeconds).toBeLessThan(0);
  });

  it("holds the sign across seeds, so neither result is one lucky run", () => {
    for (const [config, sign] of [
      [TARGET, 1],
      [CONTROL, -1],
    ] as const) {
      for (let i = 0; i < 5; i += 1) {
        const result = compare({ ...config, seed: config.seed + i * 7919 });
        expect(
          Math.sign(result.deltaSeconds),
          `${config.label} flipped sign on seed offset ${i}`,
        ).toBe(sign);
      }
    }
  });
});

describe("a quoted result is an equilibrium, not a snapshot of a growing queue", () => {
  // This is the check that caught the wrong answer. A configuration whose effect
  // grew +20% → +58% as the horizon lengthened passed the within-window drift
  // check on 6 of 10 seeds, because a slow monotone ramp looks flat inside any
  // one window. The only honest test is that the answer stops depending on how
  // long we watch.
  it("gives the same answer over a longer horizon, for both configurations", () => {
    for (const config of [TARGET, CONTROL]) {
      const check = horizonCheck(config);
      expect(check.ok, `${config.label}: ${check.reason}`).toBe(true);
    }
  });

  it("finishes every measured trip, so no cohort member is quietly excluded", () => {
    for (const config of [TARGET, CONTROL]) {
      for (const connectorOpen of [false, true]) {
        const run = runExperiment(config, { connectorOpen });
        expect(run.unfinished, `${config.label} open=${connectorOpen}`).toBe(0);
      }
    }
  });

  it("refuses to call a growing queue usable", () => {
    // Demand far above what the streets can serve: the honest answer is
    // "inconclusive", not a number.
    const flooded = runExperiment({ ...TARGET, demandPerHour: 3000 }, { connectorOpen: true });
    expect(flooded.usable).toBe(false);
  });
});

describe("the physics stays physical", () => {
  it("never produces a negative speed or an off-link position", () => {
    const sim = simulationFor(TARGET, true);
    const network = networkOf(TARGET);
    const steps = Math.round(horizonOf(TARGET) / TARGET.dt);
    for (let i = 0; i < steps; i += 1) {
      sim.step();
      if (i % 40 !== 0) continue;
      for (const id of ["SA", "AT", "SB", "BT", "AB"] as const) {
        const vehicles = sim.vehiclesOn(id);
        for (const vehicle of vehicles) {
          expect(vehicle.vel).toBeGreaterThanOrEqual(0);
          expect(vehicle.pos).toBeGreaterThanOrEqual(0);
          expect(vehicle.pos).toBeLessThanOrEqual(network.links[id].length + 1);
          expect(vehicle.links[vehicle.leg]).toBe(id);
        }
        // Single lane: nobody overtakes, so the list stays ordered by position.
        for (let k = 1; k < vehicles.length; k += 1) {
          expect(vehicles[k].pos).toBeLessThanOrEqual(vehicles[k - 1].pos + 1e-6);
        }
      }
    }
  });

  it("only ever moves a vehicle along its own route", () => {
    const sim = simulationFor(TARGET, true);
    const routes = networkOf(TARGET).routes;
    for (let i = 0; i < 6000; i += 1) sim.step();
    for (const arrival of sim.arrivals) {
      expect(Object.keys(routes)).toContain(arrival.routeId);
      expect(arrival.travelTime).toBeGreaterThan(0);
      expect(arrival.arriveTime).toBeGreaterThan(arrival.departTime);
    }
  });

  it("almost never needs the emergency deceleration ceiling", () => {
    // A clamp that fires constantly is a bug being hidden, not a safety net.
    const run = runExperiment(TARGET, { connectorOpen: true });
    const steps = horizonOf(TARGET) / TARGET.dt;
    expect(run.physicsClamped / steps).toBeLessThan(0.05);
  });

  it("has a deceleration ceiling that is a real bound", () => {
    expect(MAX_DECELERATION).toBeGreaterThan(0);
  });
});

describe("an empty road takes as long as its length and speed say", () => {
  // The reference test. It also guards the subtlest failure in the model: if a
  // vehicle could not see its leader *across* a junction, everyone would brake at
  // every junction, node delay would scale with the number of junctions, and the
  // connector — which adds one — would look harmful for reasons that have nothing
  // to do with Braess.
  it("takes one vehicle across three links in free-flow time", () => {
    const network = networkOf(TARGET);
    const sim = simulationFor(TARGET, true, [
      { id: 0, departTime: 1, v0Factor: 1, TFactor: 1, routeDraw: 0.999999 },
    ]);
    for (let i = 0; i < 6000 && sim.arrivals.length === 0; i += 1) sim.step();

    expect(sim.arrivals).toHaveLength(1);
    const trip = sim.arrivals[0];
    expect(trip.routeId).toBe("shortcut");

    const expected = routeFreeFlowTime(network, "shortcut");
    // The only legitimate excess is IDM's finite acceleration back up to the
    // posted speed after the throat, which the free-flow figure (a speed-profile
    // integral) does not model. Anything beyond a few per cent means junctions
    // are costing time they should not.
    expect(trip.travelTime).toBeGreaterThan(expected * 0.98);
    expect(
      trip.travelTime,
      `${trip.travelTime.toFixed(1)}s to cross three links whose free-flow sum is ` +
        `${expected.toFixed(1)}s — junctions are adding delay on an empty network`,
    ).toBeLessThan(expected * 1.08);
  });

  it("costs no more to cross two junctions than to cross none", () => {
    // Same distance travelled either way; the shortcut just crosses more nodes.
    const network = networkOf(TARGET);
    const single = (draw: number): number => {
      const sim = simulationFor(TARGET, true, [
        { id: 0, departTime: 1, v0Factor: 1, TFactor: 1, routeDraw: draw },
      ]);
      for (let i = 0; i < 6000 && sim.arrivals.length === 0; i += 1) sim.step();
      return sim.arrivals[0].travelTime - routeFreeFlowTime(network, sim.arrivals[0].routeId);
    };
    const twoJunctions = single(0.999999);
    const oneJunction = single(0);
    expect(Math.abs(twoJunctions - oneJunction)).toBeLessThan(
      linkFreeFlowTime(network.links.AB) * 0.5,
    );
  });
});
