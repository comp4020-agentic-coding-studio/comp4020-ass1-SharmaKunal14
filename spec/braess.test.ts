import { describe, expect, it } from "vitest";
import {
  BASELINE_MINUTES,
  TOTAL_DRIVERS,
  calculateBraess,
} from "../src/braess.ts";

describe("the transparent Braess calculation", () => {
  it("starts with two balanced old routes", () => {
    expect(calculateBraess(0)).toMatchObject({
      shortcutUsers: 0,
      oldRouteUsers: 4_000,
      usersPerOldRoute: 2_000,
      narrowRoadUsers: 2_000,
      narrowRoadMinutes: 20,
      oldRouteMinutes: 65,
      shortcutRouteMinutes: 40,
      averageMinutes: 65,
      averageChangeMinutes: 0,
    });
  });

  it("shows the complete arithmetic at useful checkpoints", () => {
    expect(calculateBraess(1_000)).toMatchObject({
      narrowRoadUsers: 2_500,
      oldRouteMinutes: 70,
      shortcutRouteMinutes: 50,
      averageMinutes: 65,
    });
    expect(calculateBraess(2_000)).toMatchObject({
      narrowRoadUsers: 3_000,
      oldRouteMinutes: 75,
      shortcutRouteMinutes: 60,
      averageMinutes: 67.5,
    });
    expect(calculateBraess(4_000)).toMatchObject({
      narrowRoadUsers: 4_000,
      narrowRoadMinutes: 40,
      oldRouteMinutes: 85,
      shortcutRouteMinutes: 80,
      averageMinutes: 80,
      individualSavingMinutes: 5,
      averageChangeMinutes: 15,
    });
  });

  it("makes every individual switch rational while the final average is worse", () => {
    for (let users = 0; users <= TOTAL_DRIVERS; users += 100) {
      const result = calculateBraess(users);
      expect(result.shortcutRouteMinutes).toBeLessThan(result.oldRouteMinutes);
    }
    expect(calculateBraess(TOTAL_DRIVERS).averageMinutes).toBeGreaterThan(BASELINE_MINUTES);
  });

  it("normalises malformed and out-of-range input", () => {
    expect(calculateBraess(Number.NaN).shortcutUsers).toBe(0);
    expect(calculateBraess(-50).shortcutUsers).toBe(0);
    expect(calculateBraess(4_900).shortcutUsers).toBe(4_000);
    expect(calculateBraess(1_049).shortcutUsers).toBe(1_000);
    expect(calculateBraess(1_051).shortcutUsers).toBe(1_100);
  });
});
