import { describe, expect, it } from "vitest";
import {
  BASELINE_MINUTES,
  BRAESS_LANDMARKS,
  SHORTCUT_LINK_MINUTES,
  TOTAL_DRIVERS,
  calculateBraess,
  findBraessLandmarks,
} from "../src/braess.ts";

describe("the transparent Braess calculation", () => {
  it("states the connector assumption used by every shortcut trip", () => {
    expect(SHORTCUT_LINK_MINUTES).toBe(0);
  });

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

  it("derives the discovery landmarks from the same arithmetic", () => {
    expect(BRAESS_LANDMARKS).toEqual({
      bestShortcutUsers: 500,
      bestAverageMinutes: 64.6875,
      breakEvenShortcutUsers: 1_000,
    });
    expect(findBraessLandmarks()).toEqual(BRAESS_LANDMARKS);

    const beforeBreakEven = calculateBraess(900);
    const afterBreakEven = calculateBraess(1_100);
    expect(beforeBreakEven.averageMinutes).toBeLessThan(BASELINE_MINUTES);
    expect(afterBreakEven.averageMinutes).toBeGreaterThan(BASELINE_MINUTES);
  });

  it("normalises malformed and out-of-range input", () => {
    expect(calculateBraess(Number.NaN).shortcutUsers).toBe(0);
    expect(calculateBraess(-50).shortcutUsers).toBe(0);
    expect(calculateBraess(4_900).shortcutUsers).toBe(4_000);
    expect(calculateBraess(1_049).shortcutUsers).toBe(1_000);
    expect(calculateBraess(1_051).shortcutUsers).toBe(1_100);
  });
});
