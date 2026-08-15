// The visible narrative is intentionally smaller than the simulation beneath it.
// One state asks for the decision, one lets the traffic respond, one explains the
// verified result, and closing the same road completes the experiment.

import type { LiveRun } from "./live.ts";
import type { LinkId } from "./sim/network.ts";

export type StateId = "decide" | "watch" | "verdict" | "recover" | "reveal";

export const STATES: readonly StateId[] = ["decide", "watch", "verdict", "recover", "reveal"];

export type Beat = {
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
  readonly action: string | null;
  readonly spotlight: readonly LinkId[];
};

export const STORY: Readonly<Record<StateId, Beat>> = Object.freeze({
  decide: {
    eyebrow: "Eastgate → Central · morning peak",
    headline: "Traffic is slow. Would one more road help?",
    body: "With empty roads, the proposed link makes the quickest route 31 seconds shorter.",
    action: "Build the road",
    spotlight: ["AB"],
  },
  watch: {
    eyebrow: "The road is open · one live run",
    headline: "Watch what drivers do.",
    body: "The live number can wander. Watch the route choices and the two narrow bridges.",
    action: null,
    spotlight: ["AB"],
  },
  verdict: {
    eyebrow: "Controlled result",
    headline: "You built a road. The average trip got longer.",
    body:
      "The shortcut stayed quick. It changed where traffic went: every shortcut trip crossed " +
      "both bottlenecks.",
    action: "Close the road",
    spotlight: ["SA", "AB", "BT"],
  },
  recover: {
    eyebrow: "Road closed · one live run",
    headline: "Now take the road away again.",
    body: "New drivers return to the two original routes and the queues begin to clear.",
    action: null,
    spotlight: ["SA", "BT"],
  },
  reveal: {
    eyebrow: "The name for what you saw",
    headline: "Braess’s paradox.",
    body:
      "Under some network conditions, a new connection changes individually sensible route " +
      "choices and raises the average trip time.",
    action: "Run it again",
    spotlight: [],
  },
});

const WATCH_MINIMUM_SECONDS = 700;
const WATCH_MAXIMUM_SECONDS = 1800;
const RECOVERY_MINIMUM_SECONDS = 700;

/**
 * Automatic transitions wait for things visible in the live run. They never call
 * the rolling display an equilibrium: the scientific verdict comes from the paired
 * headless experiment, while these conditions only decide when the illustration
 * has shown enough route switching and queueing to make that verdict intelligible.
 */
export function shouldAdvance(state: StateId, run: LiveRun, elapsed: number): boolean {
  if (state === "watch") {
    const enoughTrips = run.anchoredTrips >= 32;
    const shortcutVisible = run.shareOf("shortcut") >= 0.2;
    const bottleneckVisible = Math.min(run.congestionOf("SA"), run.congestionOf("BT")) >= 1.08;
    if (elapsed >= WATCH_MAXIMUM_SECONDS) return enoughTrips && shortcutVisible;
    return elapsed >= WATCH_MINIMUM_SECONDS && enoughTrips && shortcutVisible && bottleneckVisible;
  }

  if (state === "recover") {
    return (
      elapsed >= RECOVERY_MINIMUM_SECONDS &&
      run.anchoredTrips >= 24 &&
      run.shareOf("shortcut") < 0.08
    );
  }

  return false;
}
