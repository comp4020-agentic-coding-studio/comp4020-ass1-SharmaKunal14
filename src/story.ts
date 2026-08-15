import type { LinkId } from "./sim/network.ts";

/**
 * The investigation is user paced. A state changes only after a visitor inspects,
 * predicts, or runs one part of the same traffic experiment. Animation never
 * decides when the scientific result is disclosed.
 */
export type StateId =
  | "map"
  | "proposal"
  | "quiet"
  | "quiet_result"
  | "peak"
  | "wave_one"
  | "wave_two"
  | "wave_three"
  | "wave_four"
  | "compare"
  | "verdict"
  | "diagnose"
  | "recovery"
  | "synthesis"
  | "reveal";

export const STATES: readonly StateId[] = [
  "map",
  "proposal",
  "quiet",
  "quiet_result",
  "peak",
  "wave_one",
  "wave_two",
  "wave_three",
  "wave_four",
  "compare",
  "verdict",
  "diagnose",
  "recovery",
  "synthesis",
  "reveal",
];

export type Beat = {
  readonly chapter: 1 | 2 | 3 | 4 | 5 | 6;
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
  readonly action: string;
  readonly spotlight: readonly LinkId[];
};

export const STORY: Readonly<Record<StateId, Beat>> = Object.freeze({
  map: {
    chapter: 1,
    eyebrow: "Chapter 1 of 6 · Read the network",
    headline: "Two routes. Same empty-road time.",
    body: "Trace both original routes from Eastgate to Central before changing the map.",
    action: "Continue to the proposal",
    spotlight: [],
  },
  proposal: {
    chapter: 2,
    eyebrow: "Chapter 2 of 6 · The tempting shortcut",
    headline: "Build one shortcut.",
    body: "Connect Riverside and Millbrook to create a shorter third route.",
    action: "Draw the shortcut",
    spotlight: [],
  },
  quiet: {
    chapter: 3,
    eyebrow: "Chapter 3 of 6 · Sanity-check the idea",
    headline: "Would the link help when roads are quiet?",
    body: "At 300 cars an hour, predict the result before running the controlled test.",
    action: "Compare the verified quiet runs",
    spotlight: ["AB"],
  },
  quiet_result: {
    chapter: 3,
    eyebrow: "Quiet-road result · 300 cars an hour",
    headline: "Here, one more road really does help.",
    body: "The same link saves eight seconds when the network has room to absorb the shift.",
    action: "Raise demand to morning peak",
    spotlight: ["AB"],
  },
  peak: {
    chapter: 4,
    eyebrow: "Chapter 4 of 6 · Stress the network",
    headline: "Now make the same choice at rush hour.",
    body: "Demand rises to 860 cars an hour. Which route would you try after the link opens?",
    action: "Build it and release traffic",
    spotlight: ["AB"],
  },
  wave_one: {
    chapter: 5,
    eyebrow: "Chapter 5 of 6 · First traffic wave",
    headline: "The shortcut wins attention.",
    body: "New drivers are more likely—not forced—to choose the route that currently looks quickest.",
    action: "Release the next wave",
    spotlight: ["AB"],
  },
  wave_two: {
    chapter: 5,
    eyebrow: "Shared learning · second wave",
    headline: "Both short roads absorb the shift.",
    body: "Each gold shortcut journey crosses Riverside Road, the new link, and Millbrook Road.",
    action: "Let drivers keep learning",
    spotlight: ["SA", "AB", "BT"],
  },
  wave_three: {
    chapter: 5,
    eyebrow: "Shared learning · third wave",
    headline: "The route split changes again.",
    body: "Finished trips update the shared estimates. Watch the route split keep moving.",
    action: "Release one final peak wave",
    spotlight: ["SA", "AB", "BT"],
  },
  wave_four: {
    chapter: 5,
    eyebrow: "Shared learning · fourth wave",
    headline: "Both bridge approaches are now slowing.",
    body: "The link stays quick while its traffic piles onto both old bridge approaches.",
    action: "Build a fair comparison",
    spotlight: ["SA", "AB", "BT"],
  },
  compare: {
    chapter: 5,
    eyebrow: "Controlled comparison",
    headline: "What should change between the two runs?",
    body: "Choose the design that isolates the effect of opening the road.",
    action: "Run the paired comparison",
    spotlight: [],
  },
  verdict: {
    chapter: 5,
    eyebrow: "Paired result · 860 cars an hour",
    headline: "The average trip got longer.",
    body: "The same generated schedule was run twice. Only the road changed.",
    action: "Trace the consequence",
    spotlight: ["SA", "AB", "BT"],
  },
  diagnose: {
    chapter: 6,
    eyebrow: "Chapter 6 of 6 · Explain the result",
    headline: "Where did the extra traffic go?",
    body: "Inspect both old bridges. The new link is useful; its position changes what they must carry.",
    action: "Close the link",
    spotlight: ["SA", "BT"],
  },
  recovery: {
    chapter: 6,
    eyebrow: "A final check · road closed",
    headline: "Closing a road does not teleport cars.",
    body: "Cars already on the link finish their trip. New departures must choose one of the original routes.",
    action: "Release one final wave",
    spotlight: ["SA", "BT"],
  },
  synthesis: {
    chapter: 6,
    eyebrow: "The original choice set returns",
    headline: "New shortcut choices fall to zero.",
    body: "The extra option—not an arbitrary delay rule—caused the route shift you observed.",
    action: "Name the phenomenon",
    spotlight: ["SA", "BT"],
  },
  reveal: {
    chapter: 6,
    eyebrow: "The name for what you found",
    headline: "Braess’s paradox.",
    body: "Under some network conditions, individually sensible route choices can raise the group’s average travel time.",
    action: "Run the case again",
    spotlight: [],
  },
});
