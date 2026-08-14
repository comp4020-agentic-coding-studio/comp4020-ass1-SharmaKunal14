// How drivers choose. Deliberately the least clever part of the project.
//
// A driver knows only its own experience: the travel times it and other drivers
// have actually had, smoothed. Nobody is told the topology, nobody is told which
// link is congested, and nothing here can see whether the connector is open —
// only which routes are on offer. That is what makes the shift in route shares
// a *result* rather than a script.
//
// The choice rule is a logit over learned route times, the standard model of
// stochastic user equilibrium (Daganzo & Sheffi 1977); the smoothing is
// ordinary day-to-day learning from experience. A route nobody has driven yet
// starts at its free-flow time — the optimistic prior a real driver has for a
// road they have only looked at, and the reason the shortcut gets tried at all.

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
 * `draw` is a uniform in [0,1) drawn for this driver *before the run starts*, so
 * the same driver makes its choice from the same random number in both
 * configurations. Only the offered routes and the learned beliefs differ.
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

/** Exponential smoothing towards the travel time a driver actually experienced. */
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
