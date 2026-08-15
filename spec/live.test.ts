import { describe, expect, it } from "vitest";
import {
  TARGET,
  buildSchedule,
  createScheduleStream,
  interventionHorizonOf,
} from "../src/experiment/config.ts";
import { LiveRun } from "../src/live.ts";

describe("the live departure stream", () => {
  it("extends without changing the seeded schedule prefix", () => {
    const stream = createScheduleStream(TARGET);
    stream.extendUntil(1200);
    const prefix = [...stream.departures];

    stream.extendUntil(12_000);

    expect(stream.departures.slice(0, prefix.length)).toEqual(prefix);
    expect(stream.departures).toEqual(buildSchedule(TARGET, 12_000));
  });

  it("keeps supplying traffic after the old finite live horizon", () => {
    const run = new LiveRun(TARGET);
    run.advanceSimulated(interventionHorizonOf(TARGET) + 2000);
    const completedAfterLongDwell = run.completedTrips;

    run.advanceSimulated(1000);

    expect(run.completedTrips).toBeGreaterThan(completedAfterLongDwell + 100);
    expect(run.activeCount).toBeGreaterThan(20);
  });
});

describe("post-anchor route choices", () => {
  function openedPeakRun(): LiveRun {
    const run = new LiveRun(TARGET);
    run.advanceSimulated(1100);
    run.setConnectorOpen(true);
    run.setAnchor(run.simTime);
    return run;
  }

  it("counts decisions before the selected trips have had time to arrive", () => {
    const run = openedPeakRun();

    expect(run.choiceCountSinceAnchor).toBe(0);
    expect(run.choiceShareSinceAnchor("shortcut")).toBe(0);

    run.advanceSimulated(100);

    expect(run.choiceCountSinceAnchor).toBeGreaterThan(0);
    expect(run.anchoredTrips).toBe(0);
    expect(run.choicesSinceAnchorFor("shortcut")).toBeGreaterThan(0);
    expect(run.choiceShareSinceAnchor("shortcut")).toBe(
      run.choicesSinceAnchorFor("shortcut") / run.choiceCountSinceAnchor,
    );
  });

  it("resets the choice boundary whenever a new anchor is set", () => {
    const run = openedPeakRun();
    run.advanceSimulated(400);
    expect(run.choiceCountSinceAnchor).toBeGreaterThan(0);

    run.setAnchor(run.simTime);

    expect(run.choiceCountSinceAnchor).toBe(0);
    for (const route of ["north", "south", "shortcut"] as const) {
      expect(run.choicesSinceAnchorFor(route)).toBe(0);
      expect(run.choiceShareSinceAnchor(route)).toBe(0);
    }

    run.advanceSimulated(100);
    const sum = (["north", "south", "shortcut"] as const).reduce(
      (total, route) => total + run.choicesSinceAnchorFor(route),
      0,
    );
    expect(sum).toBe(run.choiceCountSinceAnchor);
    expect(sum).toBeGreaterThan(0);
  });

  it("is deterministic whether a traffic wave is advanced whole or in slices", () => {
    const whole = openedPeakRun();
    const sliced = openedPeakRun();

    whole.advanceSimulated(400);
    for (let index = 0; index < 40; index += 1) sliced.advanceSimulated(10);

    for (const route of ["north", "south", "shortcut"] as const) {
      expect(sliced.choicesSinceAnchorFor(route)).toBe(whole.choicesSinceAnchorFor(route));
      expect(sliced.choiceShareSinceAnchor(route)).toBe(whole.choiceShareSinceAnchor(route));
    }
    expect(sliced.choiceCountSinceAnchor).toBe(whole.choiceCountSinceAnchor);
  });
});
