import { describe, expect, it } from "vitest";
import {
  buildEvidenceSnapshot,
  summariseSeedOutcomes,
} from "../src/experiment/evidence.ts";
import { EXPERIMENT } from "../src/experiment/result.generated.ts";

describe("seed evidence", () => {
  it("excludes unusable runs from every quoted aggregate", () => {
    const summary = summariseSeedOutcomes([
      { deltaPercent: 2, usable: true },
      { deltaPercent: 100, usable: false },
      { deltaPercent: 4, usable: true },
      { deltaPercent: -50, usable: false },
    ]);

    expect(summary).toMatchObject({
      count: 4,
      attempted: 4,
      usable: 2,
      excluded: 2,
      meanPercent: 3,
      minPercent: 2,
      maxPercent: 4,
      settled: 2,
      signHeld: true,
      attemptedSignHeld: false,
    });
    expect(summary.sdPercent).toBeCloseTo(Math.SQRT2);
  });

  it("refuses to manufacture an aggregate when no run is usable", () => {
    expect(() =>
      summariseSeedOutcomes([
        { deltaPercent: 12, usable: false },
        { deltaPercent: -4, usable: false },
      ]),
    ).toThrow(/no usable runs/);
  });
});

describe("checked-in evidence", () => {
  it("keeps the exact count behind the rounded shortcut share", () => {
    const counts = EXPERIMENT.target.routeCountsOpen;
    const total = counts.north + counts.south + counts.shortcut;

    expect(counts.shortcut).toBe(106);
    expect(total).toBe(EXPERIMENT.target.cohortSize);
    expect(Math.round((counts.shortcut / total) * 100)).toBe(
      EXPERIMENT.target.sharesOpen.shortcut,
    );
  });

  it(
    "matches a fresh computation of the complete payload",
    () => {
      expect(
        buildEvidenceSnapshot(),
        "src/experiment/result.generated.ts is stale — run `node scripts/snapshot.ts`",
      ).toEqual(EXPERIMENT);
    },
    60_000,
  );
});
