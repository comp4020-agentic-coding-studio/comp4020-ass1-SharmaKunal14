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
    headline: "Can you find two equally quick ways?",
    body: "Trace each way from Eastgate to Central. The map will add its road lengths and speed limits.",
    action: "Go to the shortcut",
    spotlight: [],
  },
  proposal: {
    chapter: 2,
    eyebrow: "Chapter 2 of 6 · Add a shortcut",
    headline: "Can you draw a quicker-looking way?",
    body: "Drag from Riverside to Millbrook on the map. The button is the keyboard alternative.",
    action: "Draw it with the keyboard",
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
    headline: "Which way would you try in a busy town?",
    body: "About 14 cars are ready to leave each minute. Commit to a route before the computer cars make their own choices.",
    action: "Start the busy morning",
    spotlight: ["AB"],
  },
  wave_one: {
    chapter: 5,
    eyebrow: "Chapter 5 of 6 · Follow the evidence",
    headline: "Pick one gold car. Where does it go?",
    body: "Gold cars chose the shortcut. Select one on the map—or use the keyboard button—to follow its complete route.",
    action: "Continue with the followed car",
    spotlight: ["AB"],
  },
  wave_two: {
    chapter: 5,
    eyebrow: "Your followed journey",
    headline: "What did that gold car use?",
    body: "Its trail begins on Riverside Road, crosses the shortcut and finishes on Millbrook Road. Keep that route in mind.",
    action: "Keep watching the morning",
    spotlight: ["SA", "AB", "BT"],
  },
  wave_three: {
    chapter: 5,
    eyebrow: "Traffic is bunching up",
    headline: "Where are the two queues forming?",
    body: "Inspect the map and select both crowded bridge roads. Keyboard controls are available below the map.",
    action: "See what the queues do next",
    spotlight: [],
  },
  wave_four: {
    chapter: 5,
    eyebrow: "You found both queues",
    headline: "What will happen to the average trip?",
    body: "The shortcut is still tempting, but its gold cars join both bridge queues. Make a prediction before measuring.",
    action: "Set up a fair test",
    spotlight: ["SA", "AB", "BT"],
  },
  compare: {
    chapter: 5,
    eyebrow: "Make the test fair",
    headline: "Build a test that changes one thing.",
    body: "Select the three cards that make the mornings fair. Only whether the shortcut is open should change.",
    action: "Use this test",
    spotlight: [],
  },
  verdict: {
    chapter: 5,
    eyebrow: "The two-replay test",
    headline: "Uncover one morning at a time.",
    body: "At about 860 cars an hour, both checked replays reuse the same 280 start times. Only the shortcut changes.",
    action: "Reveal the closed morning",
    spotlight: ["SA", "AB", "BT"],
  },
  diagnose: {
    chapter: 6,
    eyebrow: "Chapter 6 of 6 · Explain the result",
    headline: "Why did the open morning lose?",
    body: "Inspect each bridge again. This time, add the complete replay's route counts.",
    action: "Test removing the shortcut",
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
    eyebrow: "Build the explanation",
    headline: "Put the discovery in causal order.",
    body: "Choose what happens first, second and third. You can remove a placed card and try again.",
    action: "Reveal what you discovered",
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
