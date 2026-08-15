// The story, as data.
//
// Two rules hold this file together.
//
// First, every state advances on something the simulation has actually done —
// drivers have started switching, enough of them have, the network has re-settled
// — never on a countdown. A beat on a timer fires whether or not its own claim is
// true yet, which is exactly what went wrong when this was a countdown.
//
// Second, each state declares what may be on screen. The page was showing the
// network, the traffic, four metrics, a chart, a route table, the controls and the
// model note all at once, so a visitor met the whole apparatus before they had a
// reason to care about any of it. Now a panel appears at the moment it explains
// something and not before.

import type { LinkId } from "./sim/network.ts";
import type { LiveRun } from "./live.ts";

export type StateId =
  | "baseline"
  | "proposal"
  | "opening"
  | "adaptation"
  | "result"
  | "explanation"
  | "closed"
  | "reveal";

export const STATES: readonly StateId[] = [
  "baseline",
  "proposal",
  "opening",
  "adaptation",
  "result",
  "explanation",
  "closed",
  "reveal",
];

/** What a state permits on screen. Everything not listed stays hidden. */
export type Shows = {
  /** the elapsed-peak counter, so simulated time is visibly passing */
  readonly clock?: true;
  /** the before/after pair */
  readonly before?: true;
  /** which way people go, with each route's own time */
  readonly routes?: true;
  /** the trace of the average over time */
  readonly chart?: true;
  /** how each road is running, annotated at the road */
  readonly roadState?: true;
  /** the causal chain */
  readonly why?: true;
  /** the model and sources disclosure */
  readonly notes?: true;
};

export type Beat = {
  readonly id: StateId;
  readonly step: string;
  readonly headline: string;
  /** Static copy. Live states leave this out and narrate instead. */
  readonly body?: string;
  /** Roads this beat is about; the rest of the network recedes. */
  readonly spotlight: readonly LinkId[];
  /** Label for the primary action, or null where the story moves on its own. */
  readonly action: string | null;
  readonly shows: Shows;
};

export const STORY: Readonly<Record<StateId, Beat>> = Object.freeze({
  baseline: {
    id: "baseline",
    step: "The commute",
    headline: "Every morning, the same drive into town.",
    body: "Two ways to get there. Both of them work.",
    spotlight: [],
    action: null,
    shows: {},
  },
  proposal: {
    id: "proposal",
    step: "The proposal",
    headline: "There is an obvious way to make it shorter.",
    body:
      "A link across the middle would let drivers use both short bridges and skip the long " +
      "rings — about half a minute quicker, on an empty road.",
    spotlight: ["AB"],
    action: "Build the road",
    shows: {},
  },
  opening: {
    id: "opening",
    step: "It opens",
    headline: "The road opens.",
    spotlight: ["AB"],
    action: null,
    shows: { clock: true },
  },
  adaptation: {
    id: "adaptation",
    step: "Word spreads",
    headline: "Drivers are finding it.",
    spotlight: ["AB"],
    action: null,
    shows: { clock: true, routes: true },
  },
  result: {
    id: "result",
    step: "The result",
    headline: "You added a road. Everyone's commute got worse.",
    spotlight: [],
    action: "Show me why",
    shows: { before: true },
  },
  explanation: {
    id: "explanation",
    step: "Why",
    headline: "Both bridges now carry everyone.",
    spotlight: ["SA", "BT"],
    action: "Close the road",
    shows: { before: true, routes: true, chart: true, roadState: true, why: true },
  },
  closed: {
    id: "closed",
    step: "Closing it",
    headline: "Take the road away again.",
    spotlight: [],
    action: null,
    shows: { clock: true, before: true, routes: true, chart: true },
  },
  reveal: {
    id: "reveal",
    step: "The name",
    headline: "Braess's paradox",
    spotlight: [],
    action: "Run it again",
    shows: { before: true, routes: true, chart: true, notes: true },
  },
});

/**
 * Simulated seconds a state must run before it may hand over, and the point at
 * which it hands over regardless. The floor stops a beat claiming something the
 * numbers have not caught up with; the ceiling stops an unlucky run stranding a
 * visitor watching nothing happen.
 */
const PACE = {
  baseline: { min: 200, max: 200 },
  opening: { min: 260, max: 1000 },
  adaptation: { min: 600, max: 2600 },
  closed: { min: 800, max: 1800 },
} as const;

/** Share of recent departures on the link that counts as "drivers are finding it". */
const TRIED_IT = 0.06;

export function shouldAdvance(state: StateId, run: LiveRun, elapsed: number): boolean {
  if (state === "baseline") return elapsed >= PACE.baseline.max;
  if (state === "opening") {
    const { min, max } = PACE.opening;
    if (elapsed >= max) return true;
    // Somebody has to have actually driven it before "drivers are finding it".
    return elapsed >= min && run.shareOf("shortcut") >= TRIED_IT;
  }
  if (state === "adaptation") {
    const { min, max } = PACE.adaptation;
    if (elapsed >= max) return true;
    // The result may not be shown until the average it quotes has stopped moving
    // and rests on enough completed trips to be an average at all.
    return elapsed >= min && run.anchoredTrips >= 40 && run.hasSettledAcrossWindow();
  }
  if (state === "closed") {
    const { min, max } = PACE.closed;
    if (elapsed >= max) return true;
    return elapsed >= min && run.anchoredTrips >= 30 && run.hasSettledAcrossWindow();
  }
  return false;
}
