// How drivers choose. Deliberately the least clever part of the project.
//
// Every departure consults one shared table of smoothed, completed-trip travel
// times. This is aggregate/public learning, not private memory for each driver.
// The table is not told which link is congested and cannot see connector state;
// the chooser receives only the routes currently on offer. That is what makes a
// shift in route shares a result rather than a script.
//
// The choice rule is a logit over learned route times, the standard model of
// stochastic user equilibrium (Daganzo & Sheffi 1977); the smoothing is a
// stylised aggregate learning rule. A route with no completed trip starts at its
// free-flow time, which is the optimistic prior that causes it to be sampled.

import type { Network, RouteId } from "./network.ts";
import { routeFreeFlowTime } from "./network.ts";

export type Beliefs = Record<RouteId, number>;

export function initialBeliefs(network: Network): Beliefs {
  return {
    north: routeFreeFlowTime(network, "north"),
    south: routeFreeFlowTime(network, "south"),
    shortcut: routeFreeFlowTime(network, "shortcut"),
  };
}

/**
 * Choose among the available routes with P(r) ∝ exp(−θ · belief[r]).
 *
 * `draw` is a uniform value in [0,1) assigned to this scheduled departure by the
 * seeded demand stream. Paired cold-start configurations therefore use the same
 * departure-level draws; only the offered routes and shared beliefs differ.
 */
export function chooseRoute(
  beliefs: Beliefs,
  available: readonly RouteId[],
  draw: number,
  theta: number,
): RouteId {
  // Subtract the best time before exponentiating: same probabilities, no
  // overflow when θ·time is large.
  const best = Math.min(...available.map((r) => beliefs[r]));
  const weights = available.map((r) => Math.exp(-theta * (beliefs[r] - best)));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let cumulative = 0;
  const target = draw * total;
  for (let i = 0; i < available.length; i += 1) {
    cumulative += weights[i];
    if (target < cumulative) return available[i];
  }
  return available[available.length - 1];
}

/** Smooth the shared estimate toward one completed trip's measured travel time. */
export function updateBelief(
  beliefs: Beliefs,
  route: RouteId,
  experienced: number,
  alpha: number,
): void {
  beliefs[route] += alpha * (experienced - beliefs[route]);
}

/** Share of departures that chose each route, for the reveal and for checks. */
export function routeShares(counts: Record<RouteId, number>): Record<RouteId, number> {
  const total = counts.north + counts.south + counts.shortcut;
  if (total === 0) return { north: 0, south: 0, shortcut: 0 };
  return {
    north: counts.north / total,
    south: counts.south / total,
    shortcut: counts.shortcut / total,
  };
}
