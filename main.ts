// One deterministic traffic model, paced as a six-chapter investigation. Live
// waves make route adaptation visible; every quoted result comes from the frozen
// paired evidence in result.generated.ts.

import { TARGET, networkOf } from "./src/experiment/config.ts";
import { EXPERIMENT } from "./src/experiment/result.generated.ts";
import { formatDuration } from "./src/experiment/metrics.ts";
import { LiveRun, TIME_SCALE } from "./src/live.ts";
import type { LinkId, RouteId } from "./src/sim/network.ts";
import { STORY } from "./src/story.ts";
import type { StateId } from "./src/story.ts";
import { currentLayout } from "./src/view/layout.ts";
import { ROAD_NAMES, Scene, describeLoad } from "./src/view/scene.ts";

const PREROLL_FILL_SECONDS = 400;
const PREROLL_SAMPLE_SECONDS = 700;
const WAVE_CHECKPOINTS = [400, 750, 1300, 1800] as const;
const RECOVERY_SECONDS = 400;
const PRESENTATION_TIME_SCALE = 140;
const LINKS: readonly LinkId[] = ["SA", "BT", "AT", "SB", "AB"];

type QuietPrediction = "help" | "same" | "hurt";
type BusyPrediction = "shorter" | "same" | "longer";
type FairCondition =
  | "same-starts"
  | "same-rules"
  | "shortcut-only"
  | "different-starts"
  | "more-cars";
type CauseId = "tempting" | "shared" | "queues";
type BridgeId = "SA" | "BT";

const FAIR_CONDITIONS = new Set<FairCondition>(["same-starts", "same-rules", "shortcut-only"]);
const CAUSAL_ORDER: readonly CauseId[] = ["tempting", "shared", "queues"];

function need<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function needAll<T extends Element>(selector: string): T[] {
  const elements = Array.from(document.querySelectorAll<T>(selector));
  if (elements.length === 0) throw new Error(`Missing required elements: ${selector}`);
  return elements;
}

function requestedTimeScale(): number {
  const raw = new URLSearchParams(window.location.search).get("speed");
  const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : TIME_SCALE;
}

const reducesMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ui = {
  chapterNumber: need<HTMLElement>("[data-chapter-number]"),
  chapterItems: Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]")),
  story: need<HTMLElement>(".story"),
  discoveries: need<HTMLElement>("[data-discoveries]"),
  discoveryItems: Array.from(document.querySelectorAll<HTMLElement>("[data-discovery]")),
  figure: need<HTMLElement>("[data-figure]"),
  eyebrow: need<HTMLElement>("[data-eyebrow]"),
  headline: need<HTMLElement>("[data-headline]"),
  body: need<HTMLElement>("[data-body]"),
  measure: need<HTMLElement>(".measure"),
  liveMeasure: need<HTMLElement>("[data-live-measure]"),
  metric: need<HTMLElement>("[data-metric-value]"),
  metricLabel: need<HTMLElement>("[data-metric-label]"),
  metricContext: need<HTMLElement>("[data-metric-context]"),
  comparison: need<HTMLElement>("[data-comparison]"),
  closedValue: need<HTMLElement>("[data-closed-value]"),
  openValue: need<HTMLElement>("[data-open-value]"),
  deltaValue: need<HTMLElement>("[data-delta-value]"),
  caption: need<HTMLElement>("[data-caption]"),
  choices: need<HTMLElement>("[data-choices]"),
  action: need<HTMLButtonElement>("[data-action]"),
  control: need<HTMLElement>(".control"),
  status: need<HTMLElement>("[data-status]"),
  announce: need<HTMLElement>("[data-announce]"),
  loads: need<HTMLUListElement>("[data-loads]"),
  afterword: need<HTMLElement>("[data-afterword]"),
  controlDemand: need<HTMLElement>("[data-control-demand]"),
  controlClosed: need<HTMLElement>("[data-control-closed]"),
  controlOpen: need<HTMLElement>("[data-control-open]"),
  controlSeconds: need<HTMLElement>("[data-control-seconds]"),
  controlCount: need<HTMLElement>("[data-control-count]"),
  controlCohorts: needAll<HTMLElement>("[data-control-cohort]"),
  controlShare: need<HTMLElement>("[data-control-share]"),
  evidenceClosed: need<HTMLElement>("[data-evidence-closed]"),
  evidenceOpen: need<HTMLElement>("[data-evidence-open]"),
  evidencePercent: need<HTMLElement>("[data-evidence-percent]"),
  evidenceCount: need<HTMLElement>("[data-evidence-count]"),
  evidenceCohorts: needAll<HTMLElement>("[data-evidence-cohort]"),
  evidenceShare: need<HTMLElement>("[data-evidence-share]"),
  seedUsable: need<HTMLElement>("[data-seed-usable]"),
  seedAttempts: need<HTMLElement>("[data-seed-attempts]"),
  seedMean: need<HTMLElement>("[data-seed-mean]"),
};

const network = networkOf(TARGET);
const scene = new Scene(ui.figure, {
  onShortcutDraw: () => completeShortcutDraw(false),
  onShortcutVehicle: (vehicleId) => followShortcutVehicle(vehicleId, false),
  onBridge: (bridge) => inspectBridgeFromMap(bridge, false),
});

let run = freshTargetRun();
let state: StateId = "map";
let previousFrame = 0;
let announcementTimer = 0;
let animationTarget: number | null = null;
let animationNextState: StateId | null = null;
let animationFocusHeading = false;
let animationBudget = 0;
let isAdvancing = false;
let peakOpenedAt = 0;
let hasEntered = false;
let panelAnimations: Animation[] = [];

const routesVisited = new Set<"north" | "south">();
const bridgesInspected = new Set<BridgeId>();
const queuesFound = new Set<BridgeId>();
const fairConditions = new Set<FairCondition>();
let selectedRoute: "north" | "south" | null = null;
let selectedBridge: BridgeId | null = null;
let shortcutTraced = false;
let quietPrediction: QuietPrediction | null = null;
let personalRoute: RouteId | null = null;
let busyPrediction: BusyPrediction | null = null;
let followedVehicleId: number | null = null;
let verdictStep: 0 | 1 | 2 = 0;
let causalChain: CauseId[] = [];

function freshTargetRun(): LiveRun {
  const next = new LiveRun(TARGET, requestedTimeScale());
  next.advanceSimulated(PREROLL_FILL_SECONDS);
  next.setAnchor(next.simTime);
  next.advanceSimulated(PREROLL_SAMPLE_SECONDS);
  next.setAnchor(next.simTime);
  return next;
}

function resetInvestigation(): void {
  routesVisited.clear();
  bridgesInspected.clear();
  queuesFound.clear();
  fairConditions.clear();
  selectedRoute = null;
  selectedBridge = null;
  shortcutTraced = false;
  quietPrediction = null;
  personalRoute = null;
  busyPrediction = null;
  followedVehicleId = null;
  verdictStep = 0;
  causalChain = [];
  animationTarget = null;
  animationNextState = null;
  animationFocusHeading = false;
  animationBudget = 0;
  isAdvancing = false;
  peakOpenedAt = 0;
  run = freshTargetRun();
  scene.setConnectorOpen(false);
  scene.followVehicle(null);
  scene.setInteractionMode(null);
}

function applyLayout(): void {
  scene.setLayout(
    currentLayout(),
    {
      streetLength: network.links.SA.length,
      throatStart: network.links.SA.bottleneck?.start ?? network.links.SA.length,
    },
    network,
  );
  scene.setConnectorOpen(connectorLooksOpen());
  scene.spotlight(currentSpotlight());
  scene.traceRoute(currentTrace());
  scene.setNarrative(state, narrativeShare());
  scene.setInteractionMode(interactionForState());
  scene.followVehicle(followedVehicleId);
}

function fillEvidence(): void {
  const target = EXPERIMENT.target;
  const control = EXPERIMENT.control;
  const closed = formatDuration(target.closedSeconds);
  const open = formatDuration(target.openSeconds);

  ui.controlDemand.textContent = String(control.demandPerHour);
  ui.controlClosed.textContent = formatDuration(control.closedSeconds);
  ui.controlOpen.textContent = formatDuration(control.openSeconds);
  ui.controlSeconds.textContent = String(Math.round(Math.abs(control.deltaSeconds)));
  ui.controlCount.textContent = String(control.routeCountsOpen.shortcut);
  for (const element of ui.controlCohorts) element.textContent = String(control.cohortSize);
  ui.controlShare.textContent = `${control.sharesOpen.shortcut}%`;
  ui.evidenceClosed.textContent = closed;
  ui.evidenceOpen.textContent = open;
  ui.evidencePercent.textContent = `${target.deltaPercent}%`;
  ui.evidenceCount.textContent = String(target.routeCountsOpen.shortcut);
  for (const element of ui.evidenceCohorts) element.textContent = String(target.cohortSize);
  ui.evidenceShare.textContent = `${target.sharesOpen.shortcut}%`;
  ui.seedUsable.textContent = String(target.seeds.usable);
  ui.seedAttempts.textContent = String(target.seeds.attempted);
  ui.seedMean.textContent = `${target.seeds.meanPercent}%`;
}

function announce(message: string): void {
  window.clearTimeout(announcementTimer);
  ui.announce.textContent = "";
  announcementTimer = window.setTimeout(() => {
    ui.announce.textContent = message;
  }, 20);
}

function syncMeasureMode(): void {
  const showsComparison =
    state === "quiet_result" || state === "reveal" || (state === "verdict" && verdictStep === 2);
  ui.comparison.hidden = !showsComparison;
  ui.liveMeasure.hidden = showsComparison;
}

function renderDiscoveries(): void {
  const visible = STORY[state].chapter >= 5;
  ui.discoveries.hidden = !visible;
  const found = {
    route: followedVehicleId !== null,
    queues: queuesFound.size === 2,
    result: verdictStep === 2 || STATES_AFTER_VERDICT.has(state),
  } as const;
  const labels = {
    route: found.route ? "Gold route: both bridges" : "Follow a gold car",
    queues: found.queues ? "Queues: both bridges" : "Find both queues",
    result: found.result ? "Open morning: 13s slower" : "Which morning wins?",
  } as const;
  for (const item of ui.discoveryItems) {
    const key = item.dataset.discovery as keyof typeof found | undefined;
    if (key === undefined) continue;
    item.dataset.found = String(found[key]);
    const label = item.querySelector("strong");
    if (label !== null) label.textContent = labels[key];
  }
}

const STATES_AFTER_VERDICT = new Set<StateId>(["diagnose", "recovery", "synthesis", "reveal"]);

function enter(next: StateId, focusHeading = false): void {
  const previousChapter = STORY[state]?.chapter;
  state = next;
  if (next === "verdict") verdictStep = 0;
  if (next === "diagnose") {
    selectedBridge = null;
    bridgesInspected.clear();
  }
  document.body.dataset.state = next;
  (window as unknown as { storyState?: StateId }).storyState = next;

  const beat = STORY[next];
  ui.eyebrow.textContent = beat.eyebrow;
  ui.headline.textContent = beat.headline;
  ui.body.textContent = beat.body;
  ui.action.textContent = beat.action;
  ui.afterword.hidden = next !== "reveal";
  ui.measure.hidden = false;

  syncMeasureMode();

  renderChapterProgress();
  renderControls();
  renderStateCopy();
  renderDiscoveries();
  scene.setConnectorOpen(connectorLooksOpen());
  scene.spotlight(currentSpotlight());
  scene.traceRoute(currentTrace());
  scene.setNarrative(next, narrativeShare());
  scene.setInteractionMode(interactionForState());
  scene.followVehicle(followedVehicleId);

  const chapterChanged = STORY[next].chapter !== previousChapter;
  if (hasEntered) {
    animatePanels(chapterChanged ? "chapter" : "step");
    if (chapterChanged) {
      ui.story.scrollIntoView({
        // Keep the pointer geometry stable for direct SVG gestures. The panels
        // provide the visual transition; viewport motion must finish instantly.
        behavior: "auto",
        block: "start",
      });
    }
  }
  hasEntered = true;

  if (next === "quiet_result") {
    announce(
      `Quiet-road result: ${formatDuration(EXPERIMENT.control.closedSeconds)} without the road, ` +
        `${formatDuration(EXPERIMENT.control.openSeconds)} with it: ` +
        `${Math.round(Math.abs(EXPERIMENT.control.deltaSeconds))} seconds shorter. ` +
        `${EXPERIMENT.control.routeCountsOpen.shortcut} of ${EXPERIMENT.control.cohortSize} trips ` +
        `used the shortcut, which rounds to ${EXPERIMENT.control.sharesOpen.shortcut} percent.`,
    );
  } else if (next === "verdict") {
    announce("The fair test is ready. Reveal the shortcut-closed morning first.");
  } else if (next === "wave_one" || next === "wave_three") {
    const shortcut = run.choicesSinceAnchorFor("shortcut");
    const total = run.choiceCountSinceAnchor;
    const share = Math.round(run.choiceShareSinceAnchor("shortcut") * 100);
    announce(`${shortcut} of ${total} cars chose the shortcut, which rounds to ${share} percent.`);
  } else if (next === "synthesis") {
    announce("Three evidence cards are ready. Put the causes in order before the reveal.");
  } else {
    announce(`${beat.eyebrow}. ${beat.headline}`);
  }

  if (focusHeading) ui.headline.focus({ preventScroll: true });
}

/**
 * Chapter state is committed before this decorative motion begins. Cancelling
 * it can never delay a result, move keyboard focus, or alter simulation time --
 * every value on screen is already final when the animation starts.
 *
 * "chapter" plays only when the chapter number actually advances (or restarts):
 * the panels unfold like a page turning, on a hinge at the top, with a brief
 * overshoot that reads as paper settling rather than snapping into place. Every
 * other transition -- the small steps inside one chapter -- keeps the quicker,
 * quieter fade-and-rise, so stepping through a chapter's own sub-states (the
 * quiet-road replay, the four peak waves) does not repeat a big flourish on
 * every click. "delayed-step" is that same quiet fade, held back for the
 * evidence panels so the map redraws first and the numbers land a beat later.
 */
type PanelTransition = "chapter" | "step" | "delayed-step";

const UNFOLD_KEYFRAMES: Keyframe[] = [
  // A short perspective distance and a steep starting angle are what make a
  // rotateX actually read as a fold instead of a fade -- the first version used
  // -18deg at 1200px, which foreshortens a text block by only a few pixels and
  // is masked entirely by the accompanying opacity fade. -78deg at 640px swings
  // the panel up from flat, hinged at its own top edge.
  { opacity: 0, transform: "perspective(640px) rotateX(-78deg)" },
  { opacity: 1, offset: 0.22, transform: "perspective(640px) rotateX(-46deg)" },
  { opacity: 1, offset: 0.62, transform: "perspective(640px) rotateX(7deg)" },
  { opacity: 1, transform: "perspective(640px) rotateX(0deg)" },
];

const STEP_KEYFRAMES: Keyframe[] = [
  { opacity: 0.12, transform: "translateY(10px)" },
  { opacity: 1, transform: "translateY(0)" },
];

function animatePanels(kind: PanelTransition = "step"): void {
  for (const animation of panelAnimations) animation.cancel();
  panelAnimations = [];
  // Strip the lifted-sheet look unconditionally: a superseded chapter
  // animation is cancelled above, but cancel() alone would leave its shadow
  // class stuck on the panel forever if we didn't also clear it here.
  for (const panel of [ui.story, ui.measure, ui.control]) panel.classList.remove("is-turning");
  if (reducesMotion) return;

  const isChapterChange = kind === "chapter";
  const panels = [ui.story, ui.measure, ui.control];
  const keyframes = isChapterChange ? UNFOLD_KEYFRAMES : STEP_KEYFRAMES;
  const duration = isChapterChange ? 620 : 320;
  // Chapter panels fold together, hinged at the same instant, so the group
  // reads as one page turning rather than three pieces moving independently.
  // Only the quieter in-chapter step keeps a stagger.
  const stagger = isChapterChange ? 0 : 35;
  // Linear for the chapter fold, deliberately. An eased-out curve (found by
  // testing: rotateX at frac=0.12 came out ~-0.7deg instead of the ~-60deg the
  // keyframe offsets call for) front-loads almost all visual change into the
  // first ~10% of the real duration, so a fold authored to unfold gradually
  // collapses into a blink and reads as a plain fade -- which is exactly what
  // was reported. The keyframe offsets (0, 0.22, 0.62, 1) already shape the
  // pacing; the overall timing function must not re-shape it again on top.
  const easing = isChapterChange ? "linear" : "cubic-bezier(0.22, 1, 0.36, 1)";

  for (const [index, panel] of panels.entries()) {
    if (panel.hidden || typeof panel.animate !== "function") continue;
    const delay = kind === "delayed-step" && index > 0 ? 300 : index * stagger;
    // A shadow while the sheet is mid-turn is what sells the fold as paper
    // lifting off the page, rather than the text simply fading in place.
    if (isChapterChange) panel.classList.add("is-turning");
    const animation = panel.animate(keyframes, { duration, delay, easing, fill: "both" });
    animation.addEventListener(
      "finish",
      () => {
        animation.cancel();
        panel.classList.remove("is-turning");
        panelAnimations = panelAnimations.filter((candidate) => candidate !== animation);
      },
      { once: true },
    );
    panelAnimations.push(animation);
  }
}

function renderChapterProgress(): void {
  const chapter = STORY[state].chapter;
  ui.chapterNumber.textContent = String(chapter);
  for (const item of ui.chapterItems) {
    const itemChapter = Number(item.dataset.chapter);
    if (itemChapter === chapter) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.classList.toggle("is-complete", itemChapter < chapter);
  }
}

function choiceButton(
  value: string,
  label: string,
  detail: string,
  selected: boolean,
  complete = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.choice = value;
  button.setAttribute("aria-pressed", String(selected));
  if (complete) button.dataset.complete = "true";

  const title = document.createElement("span");
  title.className = "choice__title";
  title.textContent = label;
  const description = document.createElement("span");
  description.className = "choice__detail";
  description.textContent = detail;
  button.append(title, description);
  return button;
}

function radioGroup<T extends string>(
  name: string,
  legendText: string,
  options: readonly { readonly value: T; readonly label: string; readonly detail: string }[],
  selected: T | null,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "choice-group";
  const legend = document.createElement("legend");
  legend.className = "choice-group__legend";
  legend.textContent = legendText;
  fieldset.append(legend);

  const optionsHost = document.createElement("div");
  optionsHost.className = "choice-group__options";
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.dataset.radio = name;
    input.checked = selected === option.value;
    const copy = document.createElement("span");
    copy.className = "option__copy";
    const title = document.createElement("span");
    title.className = "option__title";
    title.textContent = option.label;
    const detail = document.createElement("span");
    detail.className = "option__detail";
    detail.textContent = option.detail;
    copy.append(title, detail);
    label.append(input, copy);
    optionsHost.append(label);
  }
  fieldset.append(optionsHost);
  return fieldset;
}

function fairTestBuilder(): HTMLElement {
  const host = document.createElement("div");
  host.className = "builder builder--fair";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "Conditions kept the same in the fair test");
  const options: readonly {
    readonly value: FairCondition;
    readonly label: string;
    readonly detail: string;
  }[] = [
    { value: "same-starts", label: "Same 280 start times", detail: "keep who leaves when" },
    { value: "same-rules", label: "Same driving rules", detail: "cars choose the same way" },
    { value: "shortcut-only", label: "Change only the shortcut", detail: "closed once, open once" },
    { value: "different-starts", label: "Different start times", detail: "a different morning" },
    { value: "more-cars", label: "Add more cars", detail: "changes traffic as well" },
  ];
  for (const option of options) {
    const button = choiceButton(
      option.value,
      option.label,
      option.detail,
      fairConditions.has(option.value),
    );
    button.dataset.fairCondition = option.value;
    host.append(button);
  }
  return host;
}

function causalBuilder(): HTMLElement {
  const host = document.createElement("div");
  host.className = "builder builder--causal";
  const ordered = document.createElement("ol");
  ordered.className = "causal-slots";
  ordered.setAttribute("aria-label", "Your cause and effect order");
  for (let index = 0; index < 3; index += 1) {
    const item = document.createElement("li");
    const cause = causalChain[index];
    if (cause === undefined) {
      item.textContent = `${index + 1}. Choose a card`;
    } else {
      const button = causeButton(cause);
      button.dataset.causePlaced = "true";
      button.setAttribute("aria-label", `Remove step ${index + 1}: ${causeLabel(cause)}`);
      item.append(button);
    }
    ordered.append(item);
  }
  const bank = document.createElement("div");
  bank.className = "causal-bank";
  bank.setAttribute("role", "group");
  bank.setAttribute("aria-label", "Available cause cards");
  for (const cause of CAUSAL_ORDER) {
    if (!causalChain.includes(cause)) bank.append(causeButton(cause));
  }
  host.append(ordered, bank);
  return host;
}

function causeButton(cause: CauseId): HTMLButtonElement {
  const detail =
    cause === "tempting"
      ? "what drivers see"
      : cause === "shared"
        ? "where gold cars go"
        : "what happens to traffic";
  const button = choiceButton(cause, causeLabel(cause), detail, false);
  button.dataset.cause = cause;
  return button;
}

function causeLabel(cause: CauseId): string {
  if (cause === "tempting") return "The shortcut looks quickest";
  if (cause === "shared") return "Gold cars use both bridges";
  return "Both bridge queues grow";
}

function fairTestReady(): boolean {
  return fairConditions.size === FAIR_CONDITIONS.size &&
    [...FAIR_CONDITIONS].every((condition) => fairConditions.has(condition));
}

function causalOrderReady(): boolean {
  return CAUSAL_ORDER.every((cause, index) => causalChain[index] === cause);
}

function renderControls(): void {
  ui.choices.replaceChildren();
  ui.action.disabled = false;

  if (state === "map") {
    ui.choices.append(
      choiceButton(
        "north",
        "Show north way",
        "through Riverside",
        selectedRoute === "north",
        routesVisited.has("north"),
      ),
      choiceButton(
        "south",
        "Show south way",
        "through Millbrook",
        selectedRoute === "south",
        routesVisited.has("south"),
      ),
    );
    ui.action.disabled = routesVisited.size < 2;
  } else if (state === "quiet") {
    ui.choices.append(
      radioGroup<QuietPrediction>(
        "quiet-prediction",
        "Your prediction",
        [
          { value: "help", label: "Trips get shorter", detail: "the shortcut helps" },
          { value: "same", label: "Almost no change", detail: "cars spread between the roads" },
          { value: "hurt", label: "Trips get longer", detail: "the shortcut causes crowding" },
        ],
        quietPrediction,
      ),
    );
    ui.action.disabled = quietPrediction === null;
  } else if (state === "peak") {
    ui.choices.append(
      radioGroup<RouteId>(
        "personal-route",
        "Which way would you try?",
        [
          { value: "north", label: "North way", detail: "one bridge, then the long road" },
          { value: "shortcut", label: "Middle shortcut", detail: "shortest distance, but two bridges" },
          { value: "south", label: "South way", detail: "the long road, then one bridge" },
        ],
        personalRoute,
      ),
    );
    ui.action.disabled = personalRoute === null;
  } else if (state === "wave_one") {
    ui.choices.append(
      choiceButton(
        "follow-car",
        followedVehicleId === null ? "Follow a gold car" : "Gold car selected",
        followedVehicleId === null ? "keyboard alternative" : "trail shown on the map",
        followedVehicleId !== null,
        followedVehicleId !== null,
      ),
    );
    ui.action.disabled = followedVehicleId === null;
  } else if (state === "wave_three") {
    ui.choices.append(
      choiceButton(
        "SA",
        "Inspect Riverside",
        "north bridge road",
        selectedBridge === "SA",
        queuesFound.has("SA"),
      ),
      choiceButton(
        "BT",
        "Inspect Millbrook",
        "south bridge road",
        selectedBridge === "BT",
        queuesFound.has("BT"),
      ),
    );
    ui.action.disabled = queuesFound.size < 2;
  } else if (state === "wave_four") {
    ui.choices.append(
      radioGroup<BusyPrediction>(
        "busy-prediction",
        "Your prediction",
        [
          { value: "shorter", label: "Average gets shorter", detail: "the new route still helps" },
          { value: "same", label: "Almost no change", detail: "the effects balance out" },
          { value: "longer", label: "Average gets longer", detail: "the bridge queues dominate" },
        ],
        busyPrediction,
      ),
    );
    ui.action.disabled = busyPrediction === null;
  } else if (state === "compare") {
    ui.choices.append(fairTestBuilder());
    ui.action.disabled = !fairTestReady();
  } else if (state === "diagnose") {
    ui.choices.append(
      choiceButton(
        "SA",
        "Riverside bridge",
        "add up its trips",
        selectedBridge === "SA",
        bridgesInspected.has("SA"),
      ),
      choiceButton(
        "BT",
        "Millbrook bridge",
        "add up its trips",
        selectedBridge === "BT",
        bridgesInspected.has("BT"),
      ),
    );
    ui.action.disabled = bridgesInspected.size < 2;
  } else if (state === "synthesis") {
    ui.choices.append(causalBuilder());
    ui.action.disabled = !causalOrderReady();
  }

  if (isAdvancing) {
    for (const control of ui.choices.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input, button",
    )) {
      control.disabled = true;
    }
    ui.action.disabled = true;
    ui.action.textContent =
      state === "recovery"
        ? "Letting traffic move…"
        : state === "peak"
          ? "Starting the busy morning…"
          : "Letting more cars choose…";
  }
}

function renderComparison(
  result: typeof EXPERIMENT.target | typeof EXPERIMENT.control,
): void {
  ui.closedValue.textContent = formatDuration(result.closedSeconds);
  ui.openValue.textContent = formatDuration(result.openSeconds);
  const rounded = Math.round(Math.abs(result.deltaSeconds));
  const improves = result.deltaSeconds < 0;
  ui.deltaValue.textContent = `${improves ? "−" : "+"}${rounded} seconds`;
  ui.comparison.dataset.direction = improves ? "better" : "worse";
}

function renderStateCopy(): void {
  if (state === "map") {
    ui.metric.textContent = "5:05";
    ui.metricLabel.textContent =
      selectedRoute === null
        ? "map estimate · minutes:seconds"
        : `${selectedRoute} way · map estimate`;
    ui.metricContext.textContent =
      selectedRoute === null
        ? "Road lengths and speed limits add up to 305 seconds, or 5:05."
        : selectedRoute === "north"
          ? "Eastgate → Riverside → North Ring → Central"
          : "Eastgate → South Ring → Millbrook → Central";
    ui.status.textContent =
      routesVisited.size < 2
        ? `Tap both ways to continue · ${routesVisited.size} of 2 shown.`
        : "Both map estimates are 305 seconds, which is 5:05.";
    ui.caption.textContent =
      selectedRoute === null
        ? "Choose a way to trace it on the map."
        : `The ${selectedRoute} way is highlighted. It crosses one narrow bridge.`;
    return;
  }

  if (state === "proposal") {
    document.body.dataset.shortcutTraced = String(shortcutTraced);
    ui.measure.hidden = !shortcutTraced;
    ui.headline.textContent = shortcutTraced
      ? "The map makes the shortcut look faster."
      : STORY.proposal.headline;
    ui.body.textContent = shortcutTraced
      ? "Using the same length-and-speed estimate, the time falls from 5:05 to 4:34."
      : STORY.proposal.body;
    ui.action.textContent = shortcutTraced ? "Try it on a quiet morning" : STORY.proposal.action;
    ui.metric.textContent = "5:05 → 4:34";
    ui.metricLabel.textContent = "map estimate · old way → shortcut";
    ui.metricContext.textContent = "305 − 274 = 31 seconds. These are estimates, not timed trips.";
    ui.status.textContent = shortcutTraced
      ? "Now check whether it still helps after cars appear."
      : "Drag between the two pulsing junctions, or use the keyboard button.";
    ui.caption.textContent = shortcutTraced
      ? "Highlighted path: Eastgate → Riverside → shortcut → Millbrook → Central."
      : "The shortcut will connect Riverside directly to Millbrook.";
    return;
  }

  if (state === "quiet") {
    ui.metric.textContent = "300";
    ui.metricLabel.textContent = "average car starts per hour";
    ui.metricContext.textContent = "300 ÷ 60 = about 5 cars each minute.";
    ui.status.textContent =
      quietPrediction === null
        ? "Choose your guess to see the answer from two complete replays."
        : `Your guess: ${predictionLabel(quietPrediction)}.`;
    ui.caption.textContent = "The shortcut is teal. Both narrow bridges have room for more cars.";
    return;
  }

  if (state === "quiet_closed") {
    ui.metric.textContent = String(EXPERIMENT.control.cohortSize);
    ui.metricLabel.textContent = "saved car start times";
    ui.metricContext.textContent =
      "The starts are unevenly spaced across 20 minutes. Both replays use this exact same list.";
    ui.status.textContent =
      "Nothing is being calculated by this click. The complete replay was generated and checked beforehand.";
    ui.caption.textContent = "Replay one: shortcut closed. Every car must use an original route.";
    return;
  }

  if (state === "quiet_open") {
    ui.metric.textContent = EXPERIMENT.control.closedTotalSeconds.toLocaleString("en-AU");
    ui.metricLabel.textContent = `seconds across ${EXPERIMENT.control.cohortSize} trips`;
    ui.metricContext.textContent =
      `${EXPERIMENT.control.closedTotalSeconds.toLocaleString("en-AU")} ÷ ` +
      `${EXPERIMENT.control.cohortSize} = ${EXPERIMENT.control.closedSeconds} seconds, ` +
      `rounded to ${formatDuration(EXPERIMENT.control.closedSeconds)}.`;
    ui.status.textContent =
      "Next, reveal the second checked replay. It uses the same starts and opens only the shortcut.";
    ui.caption.textContent = "Replay one is complete. Replay two changes just one thing: the teal shortcut opens.";
    return;
  }

  if (state === "quiet_result") {
    renderComparison(EXPERIMENT.control);
    ui.metricContext.textContent =
      `Open: ${EXPERIMENT.control.openTotalSeconds.toLocaleString("en-AU")} ÷ ` +
      `${EXPERIMENT.control.cohortSize} = ${EXPERIMENT.control.openSeconds} seconds. ` +
      `${EXPERIMENT.control.closedSeconds} − ${EXPERIMENT.control.openSeconds} = ` +
      `${Math.abs(EXPERIMENT.control.deltaSeconds)} seconds saved, rounded to 8. ` +
      `${EXPERIMENT.control.routeCountsOpen.shortcut} ÷ ` +
      `${EXPERIMENT.control.cohortSize} ≈ ${EXPERIMENT.control.sharesOpen.shortcut}% used the shortcut.`;
    ui.status.textContent =
      quietPrediction === "help"
        ? "Your guess matched this quiet-road result."
        : "This quiet-road result was different from your guess.";
    ui.caption.textContent = "With fewer cars, the shortcut spreads traffic without crowding the bridges.";
    return;
  }

  if (state === "peak") {
    ui.metric.textContent = "860";
    ui.metricLabel.textContent = "average car starts per hour";
    ui.metricContext.textContent = "860 ÷ 60 = about 14 cars each minute.";
    ui.status.textContent =
      personalRoute === null
        ? "Pick the way you would try after the shortcut opens."
        : `You picked the ${routeLabel(personalRoute)}. Your pick does not control the computer cars.`;
    ui.caption.textContent = "Your answer is only a guess. It does not steer any computer car.";
    return;
  }

  if (
    state === "wave_one" ||
    state === "wave_two" ||
    state === "wave_three" ||
    state === "wave_four"
  ) {
    renderWaveCopy();
    return;
  }

  if (state === "compare") {
    ui.metric.textContent = `${fairConditions.size} of 3`;
    ui.metricLabel.textContent = "fair-test conditions selected";
    ui.metricContext.textContent = "Choose three. Wrong cards can be switched off.";
    ui.status.textContent = fairTestStatus();
    ui.caption.textContent = "The moving example is paused while you construct the comparison.";
    return;
  }

  if (state === "verdict") {
    renderVerdictStep();
    return;
  }

  if (state === "diagnose") {
    renderDiagnosis();
    return;
  }

  if (state === "recovery") {
    ui.metric.textContent = "0";
    ui.metricLabel.textContent = "new car choices since closing";
    ui.metricContext.textContent = "No new car can choose the closed shortcut.";
    ui.status.textContent = "Cars already on the shortcut keep moving; new cars use the old ways.";
    ui.caption.textContent = "The dashed shortcut is closed. Cars already on it are not erased.";
    return;
  }

  if (state === "synthesis") {
    ui.metric.textContent = `${causalChain.length} of 3`;
    ui.metricLabel.textContent = "causes placed";
    ui.metricContext.textContent = "Start with what drivers see; finish with what happens to traffic.";
    ui.status.textContent = causalStatus();
    ui.caption.textContent = "The three evidence cards above are the clues for this final explanation.";
    return;
  }

  renderComparison(EXPERIMENT.target);
  ui.metricContext.textContent =
    `This does not mean “roads are bad.” With about 5 cars a minute, ` +
    `the same shortcut saved ${Math.round(Math.abs(EXPERIMENT.control.deltaSeconds))} seconds.`;
  ui.status.textContent =
    `${personalChoiceReflection()} In the busy test, the average rose ${EXPERIMENT.target.deltaPercent}%.`;
  ui.caption.textContent = "You saw the surprise, tested it fairly, and followed where the cars went.";
}

function renderWaveCopy(): void {
  if (state === "wave_two") {
    ui.metric.textContent = "1 car → 2 bridges";
    ui.metricLabel.textContent = "your followed route";
    ui.metricContext.textContent = "Riverside Road → shortcut → Millbrook Road.";
    ui.status.textContent = isAdvancing
      ? "The same morning is continuing. No road or rule changed."
      : "You found the route. Continue and look for where cars begin to bunch up.";
    ui.caption.textContent =
      "The highlighted journey runs from Riverside, across the shortcut, to Millbrook.";
    return;
  }

  if (state === "wave_four") {
    ui.metric.textContent = "?";
    ui.metricLabel.textContent = "average trip after both queues grow";
    ui.metricContext.textContent = "Commit to shorter, unchanged or longer before the full test.";
    ui.status.textContent = isAdvancing
      ? "The same morning is continuing. No road or rule changed."
      : busyPrediction === null
        ? "Make your prediction from the route and queue evidence you collected."
        : `Prediction locked: the average gets ${busyPrediction}.`;
    ui.caption.textContent = "Time is sped up, but every car still follows the same road rules.";
    return;
  }

  if (state === "wave_three") {
    ui.metric.textContent = `${queuesFound.size} of 2`;
    ui.metricLabel.textContent = "bridge queues found";
    ui.metricContext.textContent =
      queuesFound.size === 2
        ? "Riverside and Millbrook are both slowing."
        : "Select the roads where cars are packed closely together.";
    ui.status.textContent =
      queuesFound.size === 2
        ? "Both queues found. Now let the morning continue."
        : "Tap the crowded roads on the map or use the keyboard controls.";
    ui.caption.textContent =
      selectedBridge === null
        ? "Look for cars sitting close together near a narrow bridge."
        : `${selectedBridge === "SA" ? "Riverside" : "Millbrook"} queue found.`;
    return;
  }

  const total = run.choiceCountSinceAnchor;
  const shortcut = run.choicesSinceAnchorFor("shortcut");
  const share = Math.round(run.choiceShareSinceAnchor("shortcut") * 100);
  ui.metric.textContent = `${shortcut} of ${total}`;
  ui.metricLabel.textContent = `${share}% picked the shortcut${reducesMotion ? "" : " · gold cars"}`;
  ui.metricContext.textContent = `${shortcut} ÷ ${total} ≈ ${share}%. This count is still changing.`;

  if (state === "wave_one") {
    ui.status.textContent = isAdvancing
      ? "The same morning is continuing. No road or rule changed."
      : followedVehicleId === null
        ? "Select a gold car on the map, or use the keyboard alternative."
        : "Gold car selected. Its whole route is now highlighted.";
    ui.caption.textContent =
      followedVehicleId === null
        ? "Gold marks shortcut cars. Pick one to reveal its trail."
        : "The highlighted trail follows the chosen gold car's complete route.";
  }
}

function renderVerdictStep(): void {
  syncMeasureMode();
  if (verdictStep === 0) {
    ui.metric.textContent = String(EXPERIMENT.target.cohortSize);
    ui.metricLabel.textContent = "same saved start times in both replays";
    ui.metricContext.textContent = "No average is shown yet. Reveal the shortcut-closed replay first.";
    ui.action.textContent = "Reveal the closed morning";
    ui.status.textContent = "The checked results were generated beforehand; these clicks uncover them.";
    ui.caption.textContent = "Replay one keeps the shortcut closed.";
    return;
  }
  if (verdictStep === 1) {
    ui.metric.textContent = formatDuration(EXPERIMENT.target.closedSeconds);
    ui.metricLabel.textContent = "average with shortcut closed";
    ui.metricContext.textContent =
      `${EXPERIMENT.target.closedTotalSeconds.toLocaleString("en-AU")} ÷ ` +
      `${EXPERIMENT.target.cohortSize} = ${EXPERIMENT.target.closedSeconds} seconds.`;
    ui.action.textContent = "Reuse the starts with shortcut open";
    ui.status.textContent = "Now change one thing: open the shortcut for the second replay.";
    ui.caption.textContent = "Replay one complete. The same 280 starts will be reused.";
    return;
  }
  renderComparison(EXPERIMENT.target);
  ui.metricContext.textContent =
    `Open: ${EXPERIMENT.target.openTotalSeconds.toLocaleString("en-AU")} ÷ ` +
    `${EXPERIMENT.target.cohortSize} = ${EXPERIMENT.target.openSeconds} seconds. ` +
    `${EXPERIMENT.target.openSeconds} − ${EXPERIMENT.target.closedSeconds} = ` +
    `${EXPERIMENT.target.deltaSeconds} seconds longer, rounded to 13. ` +
    `${EXPERIMENT.target.routeCountsOpen.shortcut} ÷ ${EXPERIMENT.target.cohortSize} ≈ ` +
    `${EXPERIMENT.target.sharesOpen.shortcut}% chose the shortcut.`;
  ui.action.textContent = "Investigate why the open morning lost";
  ui.status.textContent =
    `Your prediction was ${busyPrediction ?? "not recorded"}. The measured average got longer. ` +
    personalChoiceReflection();
  ui.caption.textContent = "The result is now visible. Next, use the route counts to explain it.";
}

function renderDiagnosis(): void {
  if (selectedBridge === null) {
    ui.metric.textContent = "0 of 2";
    ui.metricLabel.textContent = "bridge totals inspected";
    ui.metricContext.textContent = "Use the complete route counts to find where the extra trips went.";
    ui.status.textContent = "Tap Riverside and Millbrook on the map, or use the keyboard controls.";
    ui.caption.textContent = "The moving example is paused; these counts come from the complete replays.";
    return;
  }

  const counts = bridgeCounts(selectedBridge);
  const target = EXPERIMENT.target;
  const oldWay =
    selectedBridge === "SA" ? target.routeCountsOpen.north : target.routeCountsOpen.south;
  const bridgeName = selectedBridge === "SA" ? "Riverside" : "Millbrook";
  ui.metric.textContent = `${oldWay} + ${target.routeCountsOpen.shortcut} = ${counts.open}`;
  ui.metricLabel.textContent = `trips crossed ${bridgeName}`;
  ui.metricContext.textContent =
    `Shortcut closed: ${counts.closed}. Open: ${oldWay} old-way trips + ` +
    `${target.routeCountsOpen.shortcut} shortcut trips.`;
  ui.status.textContent =
    selectedBridge === "SA"
      ? "Every shortcut trip enters through Riverside Road."
      : "Every shortcut trip leaves through Millbrook Road.";
  ui.caption.textContent =
    bridgesInspected.size === 2
      ? "Both old bridges carry the shortcut cars. You can now close it."
      : "Inspect the other bridge to complete the causal chain.";
}

function bridgeCounts(bridge: BridgeId): { readonly closed: number; readonly open: number } {
  const target = EXPERIMENT.target;
  if (bridge === "SA") {
    return {
      closed: target.routeCountsClosed.north,
      open: target.routeCountsOpen.north + target.routeCountsOpen.shortcut,
    };
  }
  return {
    closed: target.routeCountsClosed.south,
    open: target.routeCountsOpen.south + target.routeCountsOpen.shortcut,
  };
}

function fairTestStatus(): string {
  if (fairTestReady()) return "Fair test built: the shortcut is the only difference.";
  if (fairConditions.has("different-starts")) {
    return "Different starts would make it a different morning. Switch that card off.";
  }
  if (fairConditions.has("more-cars")) {
    return "Adding cars changes traffic and the road. Switch that card off.";
  }
  return "Keep the starts and driving rules the same; change only the shortcut.";
}

function causalStatus(): string {
  if (causalOrderReady()) return "The chain is complete. You earned the final reveal.";
  if (causalChain.length === 3) return "That order does not explain the result. Remove a step and try again.";
  if (causalChain.length === 0) return "Begin with what made the shortcut attractive to drivers.";
  return `Choose what happens after “${causeLabel(causalChain.at(-1) ?? "tempting")}”.`;
}

function predictionLabel(prediction: QuietPrediction): string {
  if (prediction === "help") return "trips get shorter";
  if (prediction === "same") return "almost no change";
  return "trips get longer";
}

function routeLabel(route: RouteId): string {
  if (route === "shortcut") return "middle shortcut";
  return `${route} way`;
}

function personalChoiceReflection(): string {
  if (personalRoute === "shortcut") {
    return "You also guessed the shortcut would look tempting.";
  }
  if (personalRoute === "north" || personalRoute === "south") {
    return `You chose the ${personalRoute} way, but other cars still changed how busy it became.`;
  }
  return "The computer cars produced this result from their road choices.";
}

function currentSpotlight(): readonly LinkId[] {
  if (state === "map") {
    if (selectedRoute === "north") return ["SA", "AT"];
    if (selectedRoute === "south") return ["SB", "BT"];
    return [];
  }
  if (state === "proposal") {
    if (shortcutTraced) return ["SA", "AB", "BT"];
    return [];
  }
  if ((state === "wave_three" || state === "diagnose") && selectedBridge !== null) {
    return [selectedBridge];
  }
  return STORY[state].spotlight;
}

function currentTrace(): readonly LinkId[] {
  if (state === "map") {
    if (selectedRoute === "north") return ["SA", "AT"];
    if (selectedRoute === "south") return ["SB", "BT"];
  }
  if (state === "proposal" && shortcutTraced) return ["SA", "AB", "BT"];
  if ((state === "wave_one" && followedVehicleId !== null) || state === "wave_two") {
    return ["SA", "AB", "BT"];
  }
  return [];
}

function interactionForState(): "draw" | "follow" | "queues" | null {
  if (state === "proposal" && !shortcutTraced) return "draw";
  if (state === "wave_one" && followedVehicleId === null) return "follow";
  if (state === "wave_three" || state === "diagnose") return "queues";
  return null;
}

function connectorLooksOpen(): boolean {
  if (state === "verdict") return verdictStep === 2;
  return run.connectorOpen || state === "quiet_result";
}

function narrativeShare(): number {
  if (
    state === "wave_one" ||
    state === "wave_two" ||
    state === "wave_three" ||
    state === "wave_four"
  ) {
    return run.choiceShareSinceAnchor("shortcut");
  }
  if (state === "verdict" || state === "diagnose" || state === "reveal") {
    return EXPERIMENT.target.sharesOpen.shortcut / 100;
  }
  return 0;
}

function renderLoads(): void {
  if (ui.loads.children.length === 0) {
    for (const link of LINKS) {
      const item = document.createElement("li");
      item.dataset.load = link;
      ui.loads.append(item);
    }
  }

  for (const link of LINKS) {
    const item = ui.loads.querySelector<HTMLElement>(`[data-load="${link}"]`);
    if (item === null) continue;
    const linkStillOccupied = link === "AB" && run.vehiclesOn("AB").length > 0;
    item.hidden = link === "AB" && !connectorLooksOpen() && !linkStillOccupied;
    if (!showsLiveTraffic()) {
      item.textContent = `${ROAD_NAMES[link]}: reference drawing, no live traffic shown`;
      continue;
    }
    const condition = describeLoad(run.congestionOf(link)) || "free flowing";
    item.textContent = `${ROAD_NAMES[link]}: ${condition}`;
  }
}

function showsLiveTraffic(): boolean {
  return (
    state === "wave_one" ||
    state === "wave_two" ||
    state === "wave_three" ||
    state === "wave_four" ||
    state === "diagnose" ||
    state === "recovery" ||
    state === "synthesis" ||
    state === "reveal"
  );
}

function completeShortcutDraw(keyboardActivation: boolean): void {
  if (state !== "proposal" || shortcutTraced) return;
  shortcutTraced = true;
  scene.setInteractionMode(null);
  scene.spotlight(currentSpotlight());
  scene.traceRoute(currentTrace());
  renderControls();
  renderStateCopy();
  animatePanels("delayed-step");
  if (keyboardActivation) ui.action.focus();
  announce(
    "Shortcut drawn. The map estimate falls from 5 minutes 5 seconds to 4 minutes 34 seconds.",
  );
}

function followShortcutVehicle(vehicleId: number, keyboardActivation: boolean): void {
  if (state !== "wave_one") return;
  followedVehicleId = vehicleId;
  scene.followVehicle(vehicleId);
  scene.setInteractionMode(null);
  scene.spotlight(currentSpotlight());
  scene.traceRoute(currentTrace());
  renderControls();
  renderStateCopy();
  renderDiscoveries();
  if (keyboardActivation) {
    ui.choices.querySelector<HTMLButtonElement>('[data-choice="follow-car"]')?.focus();
  }
  announce("Gold car selected. Its trail uses Riverside Road, the shortcut and Millbrook Road.");
}

function inspectBridgeFromMap(bridge: BridgeId, keyboardActivation: boolean): void {
  if (state === "wave_three") {
    selectedBridge = bridge;
    queuesFound.add(bridge);
    scene.spotlight(currentSpotlight());
    renderControls();
    renderStateCopy();
    renderDiscoveries();
    restoreChoiceFocus(bridge, keyboardActivation);
    announce(`${bridge === "SA" ? "Riverside" : "Millbrook"} queue found.`);
    return;
  }
  if (state !== "diagnose") return;
  selectedBridge = bridge;
  bridgesInspected.add(bridge);
  scene.spotlight(currentSpotlight());
  renderControls();
  renderStateCopy();
  restoreChoiceFocus(bridge, keyboardActivation);
  const counts = bridgeCounts(bridge);
  announce(
    `${bridge === "SA" ? "Riverside" : "Millbrook"} bridge: ` +
      `${counts.closed} trips with the shortcut closed, ${counts.open} with it open.`,
  );
}

function onChoice(event: Event): void {
  if (isAdvancing) return;
  const keyboardActivation = event instanceof MouseEvent && event.detail === 0;
  const source = event.target;
  const target =
    source instanceof Element ? source.closest<HTMLButtonElement>("[data-choice]") : null;
  if (target === null) return;
  const choice = target.dataset.choice;

  if (state === "wave_one" && choice === "follow-car") {
    scene.followFirstShortcutVehicle();
    restoreChoiceFocus("follow-car", keyboardActivation);
    return;
  }

  if (state === "compare" && target.dataset.fairCondition !== undefined) {
    const condition = target.dataset.fairCondition as FairCondition;
    if (fairConditions.has(condition)) fairConditions.delete(condition);
    else fairConditions.add(condition);
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(condition, keyboardActivation);
    return;
  }

  if (state === "synthesis" && target.dataset.cause !== undefined) {
    const cause = target.dataset.cause as CauseId;
    const index = causalChain.indexOf(cause);
    if (index >= 0) causalChain.splice(index, 1);
    else if (causalChain.length < 3) causalChain.push(cause);
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(cause, keyboardActivation);
    return;
  }

  if (state === "map" && (choice === "north" || choice === "south")) {
    selectedRoute = choice;
    routesVisited.add(choice);
    scene.spotlight(currentSpotlight());
    scene.traceRoute(currentTrace());
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(choice, keyboardActivation);
    announce(`${choice === "north" ? "North" : "South"} way shown. Map estimate: 5 minutes 5 seconds.`);
    return;
  }

  if ((state === "wave_three" || state === "diagnose") && (choice === "SA" || choice === "BT")) {
    inspectBridgeFromMap(choice, keyboardActivation);
  }
}

function restoreChoiceFocus(choice: string, shouldFocus: boolean): void {
  if (!shouldFocus) return;
  ui.choices.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`)?.focus();
}

function onRadio(event: Event): void {
  if (isAdvancing || !(event.target instanceof HTMLInputElement)) return;
  const input = event.target;
  const group = input.dataset.radio;

  if (state === "quiet" && group === "quiet-prediction") {
    quietPrediction = input.value as QuietPrediction;
  } else if (state === "peak" && group === "personal-route") {
    personalRoute = input.value as RouteId;
  } else if (state === "wave_four" && group === "busy-prediction") {
    busyPrediction = input.value as BusyPrediction;
  } else {
    return;
  }
  ui.action.disabled =
    (state === "quiet" && quietPrediction === null) ||
    (state === "peak" && personalRoute === null) ||
    (state === "wave_four" && busyPrediction === null);
  renderStateCopy();
}

function onAction(event: MouseEvent): void {
  if (isAdvancing || ui.action.disabled) return;
  const keyboardActivation = event.detail === 0;

  if (state === "map") enter("proposal", keyboardActivation);
  else if (state === "proposal" && !shortcutTraced) {
    completeShortcutDraw(keyboardActivation);
  } else if (state === "proposal") enter("quiet", keyboardActivation);
  else if (state === "quiet") enter("quiet_closed", keyboardActivation);
  else if (state === "quiet_closed") enter("quiet_open", keyboardActivation);
  else if (state === "quiet_open") enter("quiet_result", keyboardActivation);
  else if (state === "quiet_result") enter("peak", keyboardActivation);
  else if (state === "peak") startPeakWaves(keyboardActivation);
  else if (state === "wave_one") startPeakCheckpoint(1, "wave_two", keyboardActivation);
  else if (state === "wave_two") startPeakCheckpoint(2, "wave_three", keyboardActivation);
  else if (state === "wave_three") startPeakCheckpoint(3, "wave_four", keyboardActivation);
  else if (state === "wave_four") enter("compare", keyboardActivation);
  else if (state === "compare") enter("verdict", keyboardActivation);
  else if (state === "verdict" && verdictStep < 2) {
    verdictStep = verdictStep === 0 ? 1 : 2;
    syncMeasureMode();
    renderControls();
    renderStateCopy();
    renderDiscoveries();
    scene.setConnectorOpen(verdictStep === 2);
    animatePanels("delayed-step");
    announce(
      verdictStep === 1
        ? `Shortcut closed average: ${formatDuration(EXPERIMENT.target.closedSeconds)}.`
        : `Shortcut open average: ${formatDuration(EXPERIMENT.target.openSeconds)}. ` +
            `${Math.round(EXPERIMENT.target.deltaSeconds)} seconds longer.`,
    );
    if (keyboardActivation) ui.headline.focus({ preventScroll: true });
  } else if (state === "verdict") enter("diagnose", keyboardActivation);
  else if (state === "diagnose") {
    run.setConnectorOpen(false);
    run.setAnchor(run.simTime);
    scene.setConnectorOpen(false);
    enter("recovery", keyboardActivation);
  } else if (state === "recovery") {
    startAnimation(run.simTime + RECOVERY_SECONDS, "synthesis", keyboardActivation);
  } else if (state === "synthesis") enter("reveal", keyboardActivation);
  else {
    resetInvestigation();
    enter("map", keyboardActivation);
  }
}

function startPeakWaves(focusHeading: boolean): void {
  run = freshTargetRun();
  run.setConnectorOpen(true);
  run.setAnchor(run.simTime);
  peakOpenedAt = run.simTime;
  scene.setConnectorOpen(true);
  startPeakCheckpoint(0, "wave_one", focusHeading);
}

function startPeakCheckpoint(index: number, next: StateId, focusHeading: boolean): void {
  const elapsed = WAVE_CHECKPOINTS[index];
  if (elapsed === undefined) throw new Error(`Unknown peak checkpoint: ${index}`);
  startAnimation(peakOpenedAt + elapsed, next, focusHeading);
}

function startAnimation(target: number, next: StateId, focusHeading = false): void {
  isAdvancing = true;
  animationTarget = target;
  animationNextState = next;
  animationFocusHeading = focusHeading;
  animationBudget = 0;
  renderControls();
  ui.status.textContent =
    state === "recovery"
      ? "Cars already on the road are finishing; new cars use the two old ways."
      : "The same morning is continuing. No road or rule changed.";

  if (reducesMotion) {
    run.advanceSimulated(target - run.simTime);
    finishAnimation();
  }
}

function advanceAnimation(wallSeconds: number): void {
  if (animationTarget === null) return;
  const remaining = animationTarget - run.simTime;
  if (remaining <= 0) {
    finishAnimation();
    return;
  }

  const scale = presentationTimeScale();
  animationBudget += Math.min(wallSeconds, 0.1) * scale;
  const wholeSteps = Math.floor(animationBudget / run.config.dt);
  const available = wholeSteps * run.config.dt;
  const simulated = Math.min(remaining, available);
  if (simulated > 0) {
    run.advanceSimulated(simulated);
    animationBudget -= simulated;
  }
  if (run.simTime >= animationTarget) finishAnimation();
}

function presentationTimeScale(): number {
  const explicit = new URLSearchParams(window.location.search).has("speed");
  return explicit ? run.timeScale : PRESENTATION_TIME_SCALE;
}

function finishAnimation(): void {
  const next = animationNextState;
  const focusHeading = animationFocusHeading;
  animationTarget = null;
  animationNextState = null;
  animationFocusHeading = false;
  animationBudget = 0;
  isAdvancing = false;
  if (next !== null) enter(next, focusHeading);
}

function frame(now: number): void {
  const wallSeconds = previousFrame === 0 ? 0 : (now - previousFrame) / 1000;
  previousFrame = now;
  if (isAdvancing) advanceAnimation(wallSeconds);

  (window as unknown as { simulatedSeconds?: number }).simulatedSeconds = run.simTime;
  scene.setNarrative(state, narrativeShare());
  scene.render(run, network, 1);
  if (
    state === "wave_one" ||
    state === "wave_two" ||
    state === "wave_three" ||
    state === "wave_four"
  ) {
    renderStateCopy();
  }
  renderLoads();
  requestAnimationFrame(frame);
}

ui.action.addEventListener("click", onAction);
ui.choices.addEventListener("click", onChoice);
ui.choices.addEventListener("change", onRadio);
window.addEventListener("resize", applyLayout);
document.addEventListener(
  "pointerdown",
  () => {
    document.body.dataset.input = "pointer";
  },
  { capture: true },
);
document.addEventListener(
  "keydown",
  () => {
    document.body.dataset.input = "keyboard";
  },
  { capture: true },
);

fillEvidence();
applyLayout();
enter("map");
scene.render(run, network, 1);
renderLoads();
requestAnimationFrame(frame);
