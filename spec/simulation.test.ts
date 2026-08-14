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
import {
  compare,
  horizonCheck,
  intervene,
  measureDecay,
  runExperiment,
} from "../src/experiment/run.ts";
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

  it("still rejects the configuration that fooled it once", () => {
    // A regression test for the *check*, not the model. This is the configuration
    // that reported +23.9% and grew to +58.4% as the horizon lengthened — an
    // oversaturated network with under-damped route learning. The gate's tolerance
    // was later given an absolute floor so it would stop rejecting small settled
    // effects; this is the evidence that the floor did not blunt it.
    const artefact: ExperimentConfig = {
      ...TARGET,
      label: "known-artefact",
      demandPerHour: 800,
      theta: 0.04,
      alpha: 0.3,
      geometry: {
        ...TARGET.geometry,
        parkwayLength: 8200,
        throat: { speedLimit: 14 / 3.6, headway: 2.8, length: 120, taper: 180 },
      },
    };
    const check = horizonCheck(artefact);
    expect(
      check.ok,
      `the gate accepted the artefact: ${check.shortPercent.toFixed(1)}% then ` +
        `${check.longPercent.toFixed(1)}%`,
    ).toBe(false);
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

describe("building the road on a running network", () => {
  // The protocol the page performs: settle with the connector closed, then open it
  // on the running network. It matters that this is measured separately, because it
  // does not give the same answer as starting with the connector already there —
  // day-to-day route learning is path dependent, and a population with habits to
  // unlearn takes a long detour to the same equilibrium.
  it("makes the commute worse in the target configuration", () => {
    const run = intervene(TARGET);
    expect(run.usable, `unusable: ${run.after.steadyState.reason}`).toBe(true);
    expect(run.conservationViolations).toEqual([]);
    expect(run.deltaSeconds).toBeGreaterThan(0);
    // Drivers found it on their own; nobody was routed onto it.
    expect(run.after.shares.shortcut).toBeGreaterThan(0.15);
    expect(run.before.shares.shortcut).toBe(0);
  });

  it("makes the commute better in the control configuration", () => {
    const run = intervene(CONTROL);
    expect(run.usable, `unusable: ${run.after.steadyState.reason}`).toBe(true);
    expect(run.deltaSeconds).toBeLessThan(0);
  });

  it("holds its sign across seeds in both configurations", () => {
    for (const [config, sign] of [
      [TARGET, 1],
      [CONTROL, -1],
    ] as const) {
      for (let i = 0; i < 4; i += 1) {
        const run = intervene({ ...config, seed: config.seed + i * 7919 });
        expect(Math.sign(run.deltaSeconds), `${config.label} flipped on seed ${i}`).toBe(sign);
      }
    }
  });

  it("decays towards the same equilibrium the cold start finds", () => {
    // This is the check that stopped the page overstating its result. The
    // warm-start effect is about three times the equilibrium at first, so the page
    // has to say which number is which — and the two protocols have to agree once
    // the adjustment is over, or one of them is wrong.
    const transient = intervene(TARGET).deltaPercent;
    const settled = measureDecay(TARGET).longPercent;
    const coldStart = compare(TARGET).deltaPercent;
    expect(transient).toBeGreaterThan(settled);
    expect(
      Math.abs(settled - coldStart),
      `warm start settles at ${settled.toFixed(1)}% but cold start says ` +
        `${coldStart.toFixed(1)}% — the two protocols disagree about the equilibrium`,
    ).toBeLessThan(2.5);
  });

  it("leaves even the drivers who never switched worse off", () => {
    // The actual sting of Braess, and the claim the page makes hardest. It is not
    // enough that the average rose: the people who kept their old route have to be
    // slower too, or "everyone got home later" is false. Checked on every seed,
    // because a claim that holds on average is not the claim being made.
    for (let i = 0; i < 5; i += 1) {
      const run = intervene({ ...TARGET, seed: TARGET.seed + i * 7919 });
      for (const route of ["north", "south"] as const) {
        const before = run.before.routeMeans[route];
        const after = run.after.routeMeans[route];
        expect(
          after,
          `seed ${i}: drivers still on the ${route} route went ${before.toFixed(0)}s → ` +
            `${after.toFixed(0)}s, so "everyone got home later" would be false`,
        ).toBeGreaterThan(before);
      }
    }
  });

  it("closing the road again re-routes nobody onto a road that is gone", () => {
    const network = networkOf(TARGET);
    const sim = simulationFor(TARGET, true);
    for (let i = 0; i < 8000; i += 1) sim.step();
    sim.setConnectorOpen(false);
    for (let i = 0; i < 8000; i += 1) sim.step();
    // Nobody is left on the closed link, and nobody still plans to use it.
    expect(sim.vehiclesOn("AB")).toHaveLength(0);
    for (const id of ["SA", "AT", "SB", "BT"] as const) {
      for (const vehicle of sim.vehiclesOn(id)) {
        expect(vehicle.links).not.toContain("AB");
        expect(Object.values(network.routes)).toContainEqual(vehicle.links);
      }
    }
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
