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
  | "quiet_closed"
  | "quiet_open"
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
  "quiet_closed",
  "quiet_open",
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
    eyebrow: "Chapter 1 of 6 · Meet the roads",
    headline: "The map says both ways take 5:05.",
    body: "That estimate uses only road lengths and speed limits. Trace each way from Eastgate to Central.",
    action: "Go to the shortcut",
    spotlight: [],
  },
  proposal: {
    chapter: 2,
    eyebrow: "Chapter 2 of 6 · Add a shortcut",
    headline: "Build a third way across town.",
    body: "Connect Riverside to Millbrook.",
    action: "Draw the shortcut",
    spotlight: [],
  },
  quiet: {
    chapter: 3,
    eyebrow: "Chapter 3 of 6 · Try a quiet morning",
    headline: "Will the shortcut still help?",
    body: "300 cars an hour is about five each minute. First guess, then see two replays where only the shortcut changes.",
    action: "Set up the quiet-road test",
    spotlight: ["AB"],
  },
  quiet_closed: {
    chapter: 3,
    eyebrow: "Quiet test · Step 1 of 3",
    headline: "First, keep the shortcut closed.",
    body: "A complete replay already timed the same 96 starts from departure to arrival. Your click will reveal that checked result; it is not running the simulation now.",
    action: "Show the closed-road arithmetic",
    spotlight: ["SA", "AT", "SB", "BT"],
  },
  quiet_open: {
    chapter: 3,
    eyebrow: "Quiet test · Step 2 of 3",
    headline: "Closed-road average: 5:19.",
    body: "All 96 trip times add to 30,586 seconds. Divide that total by 96 to get the average trip time.",
    action: "Reuse the starts with shortcut open",
    spotlight: ["SA", "AT", "SB", "BT"],
  },
  quiet_result: {
    chapter: 3,
    eyebrow: "Quiet test · Step 3 of 3",
    headline: "Opening it saves about 8 seconds.",
    body: "The second checked replay reused the same 96 start times. The only change was opening the shortcut.",
    action: "Try a busy morning",
    spotlight: ["AB"],
  },
  peak: {
    chapter: 4,
    eyebrow: "Chapter 4 of 6 · Make the roads busy",
    headline: "Now add almost three times as many cars.",
    body: "About 14 cars are ready to leave each minute. Pick the way you would try; your answer will not control the computer cars.",
    action: "Open shortcut and watch cars choose",
    spotlight: ["AB"],
  },
  wave_one: {
    chapter: 5,
    eyebrow: "Chapter 5 of 6 · First cars choose",
    headline: "Many try the shortcut first.",
    body: "Each car checks times learned from finished trips. A faster-looking way has a better chance of being picked, but it is not guaranteed.",
    action: "Let the next cars choose",
    spotlight: ["AB"],
  },
  wave_two: {
    chapter: 5,
    eyebrow: "Follow one gold car",
    headline: "One shortcut car uses both old bridges.",
    body: "It enters on Riverside Road, crosses the shortcut, then leaves on Millbrook Road.",
    action: "Let the next cars choose",
    spotlight: ["SA", "AB", "BT"],
  },
  wave_three: {
    chapter: 5,
    eyebrow: "More cars choose",
    headline: "Later cars learn from earlier trips.",
    body: "When a trip finishes, its time updates the remembered time for that way. New cars use those remembered times.",
    action: "Let the final cars choose",
    spotlight: ["SA", "AB", "BT"],
  },
  wave_four: {
    chapter: 5,
    eyebrow: "Watch both old bridges",
    headline: "The shortcut crowds both old bridges.",
    body: "The middle road stays quick, but every gold trip also adds traffic to Riverside and Millbrook Roads.",
    action: "Set up a fair test",
    spotlight: ["SA", "AB", "BT"],
  },
  compare: {
    chapter: 5,
    eyebrow: "Make the test fair",
    headline: "What should stay the same?",
    body: "Replay the same busy morning twice. Change only whether the shortcut is open.",
    action: "Show the two full replays",
    spotlight: [],
  },
  verdict: {
    chapter: 5,
    eyebrow: "Busy result · about 14 cars a minute",
    headline: "The average trip got longer.",
    body: "860 an hour is an average, not an exact count. This saved 20-minute list had 280 start times; we replayed it with the shortcut closed and open.",
    action: "See where the extra traffic went",
    spotlight: ["SA", "AB", "BT"],
  },
  diagnose: {
    chapter: 6,
    eyebrow: "Chapter 6 of 6 · Follow the traffic",
    headline: "The shortcut makes both bridges busier.",
    body: "Tap each bridge to add up the trips that used it.",
    action: "Close the shortcut",
    spotlight: ["SA", "BT"],
  },
  recovery: {
    chapter: 6,
    eyebrow: "One last check · shortcut closed",
    headline: "Cars do not vanish when a road closes.",
    body: "Cars already on the shortcut finish. New cars can choose only the north or south way.",
    action: "Let traffic keep moving",
    spotlight: ["SA", "BT"],
  },
  synthesis: {
    chapter: 6,
    eyebrow: "The old two choices are back",
    headline: "No new car can choose the shortcut.",
    body: "Closing it removed the extra choice that moved traffic onto both bridges.",
    action: "Learn the name",
    spotlight: ["SA", "BT"],
  },
  reveal: {
    chapter: 6,
    eyebrow: "What you discovered",
    headline: "Braess’s paradox.",
    body: "Sometimes sensible choices by each driver make the whole group slower.",
    action: "Start again",
    spotlight: [],
  },
});
