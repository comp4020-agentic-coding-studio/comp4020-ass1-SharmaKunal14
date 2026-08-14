// The story, as data.
//
// The page used to be one decision followed by a wait followed by a paragraph, and
// the paradox did not unfold — it was announced. So the narrative is five beats,
// and every beat advances on something the simulation has actually done, never on a
// timer: drivers have started switching, enough of them have switched, the network
// has re-settled. A beat that fired on a countdown would sometimes fire before its
// own claim was true, which is exactly what happened before this existed.

import type { LinkId } from "./sim/network.ts";
import type { LiveRun } from "./live.ts";

export type ActId = "commute" | "trying" | "switching" | "worse" | "closed";

export const ACTS: readonly ActId[] = ["commute", "trying", "switching", "worse", "closed"];

export type Act = {
  readonly id: ActId;
  readonly step: string;
  readonly headline: string;
  /** Static body copy, where the beat does not depend on live numbers. */
  readonly body?: string;
  /** Roads the beat is about, lifted out of the picture while it plays. */
  readonly spotlight: readonly LinkId[];
  /** Label for the primary action, or null when the beat advances on its own. */
  readonly action: string | null;
};

export const STORY: Readonly<Record<ActId, Act>> = Object.freeze({
  commute: {
    id: "commute",
    step: "One of five",
    headline: "Two ways into town. Both of them work.",
    body:
      "Every driver crosses one narrow bridge, then takes a long ring road. The dotted link " +
      "would let them use both bridges and skip both rings — about half a minute quicker, on " +
      "an empty road.",
    spotlight: ["AB"],
    action: "Build the road",
  },
  trying: {
    id: "trying",
    step: "Two of five",
    headline: "The first drivers try it. They get home sooner.",
    spotlight: ["AB"],
    action: null,
  },
  switching: {
    id: "switching",
    step: "Three of five",
    headline: "Word gets around.",
    spotlight: ["SA", "BT"],
    action: null,
  },
  worse: {
    id: "worse",
    step: "Four of five",
    headline: "Everyone got home later.",
    spotlight: ["SA", "BT"],
    action: "Close the road",
  },
  closed: {
    id: "closed",
    step: "Five of five",
    headline: "Close it, and everyone speeds up again.",
    spotlight: [],
    action: "Run it again",
  },
});

/**
 * Simulated seconds a beat must run before it may hand over, and the point at which
 * it hands over regardless. The floor stops a beat claiming something the numbers
 * have not caught up with; the ceiling stops an unlucky run stranding a visitor.
 */
export const PACING = Object.freeze({
  trying: { min: 220, max: 900 },
  switching: { min: 500, max: 2600 },
  closed: { min: 800, max: 1800 },
});

/** Share of recent departures using the link that counts as "word got around". */
const WORD_IS_OUT = 0.2;

/**
 * Should this beat hand over yet? Each condition is a measurement, and each one is
 * the thing its beat is about.
 */
export function shouldAdvance(act: ActId, run: LiveRun, elapsed: number): boolean {
  if (act === "trying") {
    const { min, max } = PACING.trying;
    if (elapsed >= max) return true;
    // Somebody has to have actually tried it before "word gets around" is true.
    return elapsed >= min && run.shareOf("shortcut") >= WORD_IS_OUT;
  }
  if (act === "switching") {
    const { min, max } = PACING.switching;
    if (elapsed >= max) return true;
    // The verdict may not be drawn until the average it quotes has stopped moving
    // and rests on enough completed trips to be an average at all.
    return elapsed >= min && run.anchoredTrips >= 40 && run.hasSettledAcrossWindow();
  }
  if (act === "closed") {
    const { min, max } = PACING.closed;
    if (elapsed >= max) return true;
    return elapsed >= min && run.anchoredTrips >= 30 && run.hasSettledAcrossWindow();
  }
  return false;
}
