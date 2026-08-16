export const TOTAL_DRIVERS = 4_000;
export const FIXED_ROAD_MINUTES = 45;
export const CARS_PER_MINUTE = 100;
export const BASELINE_MINUTES = 65;

export interface BraessResult {
  shortcutUsers: number;
  oldRouteUsers: number;
  usersPerOldRoute: number;
  narrowRoadUsers: number;
  narrowRoadMinutes: number;
  oldRouteMinutes: number;
  shortcutRouteMinutes: number;
  averageMinutes: number;
  individualSavingMinutes: number;
  averageChangeMinutes: number;
}

export interface BraessLandmarks {
  bestShortcutUsers: number;
  bestAverageMinutes: number;
  breakEvenShortcutUsers: number;
}

/**
 * Non-shortcut drivers split evenly between the two identical old routes.
 * Every shortcut driver uses both narrow roads, so each narrow road carries
 * half of the old-route drivers plus every shortcut driver.
 */
export function calculateBraess(requestedShortcutUsers: number): BraessResult {
  const finiteUsers = Number.isFinite(requestedShortcutUsers) ? requestedShortcutUsers : 0;
  const shortcutUsers = Math.min(TOTAL_DRIVERS, Math.max(0, Math.round(finiteUsers / 100) * 100));
  const oldRouteUsers = TOTAL_DRIVERS - shortcutUsers;
  const usersPerOldRoute = oldRouteUsers / 2;
  const narrowRoadUsers = usersPerOldRoute + shortcutUsers;
  const narrowRoadMinutes = narrowRoadUsers / CARS_PER_MINUTE;
  const oldRouteMinutes = FIXED_ROAD_MINUTES + narrowRoadMinutes;
  const shortcutRouteMinutes = narrowRoadMinutes * 2;
  const averageMinutes =
    (oldRouteUsers * oldRouteMinutes + shortcutUsers * shortcutRouteMinutes) / TOTAL_DRIVERS;

  return {
    shortcutUsers,
    oldRouteUsers,
    usersPerOldRoute,
    narrowRoadUsers,
    narrowRoadMinutes,
    oldRouteMinutes,
    shortcutRouteMinutes,
    averageMinutes,
    individualSavingMinutes: oldRouteMinutes - shortcutRouteMinutes,
    averageChangeMinutes: averageMinutes - BASELINE_MINUTES,
  };
}

/**
 * Finds the important points a visitor can discover with the 100-driver slider.
 * Deriving these from the same model prevents explanatory copy drifting away
 * from the arithmetic it describes.
 */
export function findBraessLandmarks(): BraessLandmarks {
  let best = calculateBraess(0);
  let breakEvenShortcutUsers: number | null = null;

  for (let shortcutUsers = CARS_PER_MINUTE; shortcutUsers <= TOTAL_DRIVERS; shortcutUsers += CARS_PER_MINUTE) {
    const result = calculateBraess(shortcutUsers);
    if (result.averageMinutes < best.averageMinutes) best = result;
    if (breakEvenShortcutUsers === null && Math.abs(result.averageMinutes - BASELINE_MINUTES) < Number.EPSILON) {
      breakEvenShortcutUsers = shortcutUsers;
    }
  }

  if (breakEvenShortcutUsers === null) {
    throw new Error("The configured network has no post-opening break-even point");
  }

  return Object.freeze({
    bestShortcutUsers: best.shortcutUsers,
    bestAverageMinutes: best.averageMinutes,
    breakEvenShortcutUsers,
  });
}

export const BRAESS_LANDMARKS = findBraessLandmarks();
