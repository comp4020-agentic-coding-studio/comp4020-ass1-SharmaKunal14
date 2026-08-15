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
