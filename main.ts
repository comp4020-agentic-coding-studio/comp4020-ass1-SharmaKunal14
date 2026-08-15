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
type ComparisonChoice = "road-only" | "different-morning" | "different-demand";
type BridgeId = "SA" | "BT";

function need<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
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
  figure: need<HTMLElement>("[data-figure]"),
  eyebrow: need<HTMLElement>("[data-eyebrow]"),
  headline: need<HTMLElement>("[data-headline]"),
  body: need<HTMLElement>("[data-body]"),
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
  status: need<HTMLElement>("[data-status]"),
  announce: need<HTMLElement>("[data-announce]"),
  loads: need<HTMLUListElement>("[data-loads]"),
  afterword: need<HTMLElement>("[data-afterword]"),
  controlSeconds: need<HTMLElement>("[data-control-seconds]"),
  evidenceClosed: need<HTMLElement>("[data-evidence-closed]"),
  evidenceOpen: need<HTMLElement>("[data-evidence-open]"),
  evidencePercent: need<HTMLElement>("[data-evidence-percent]"),
  evidenceCount: need<HTMLElement>("[data-evidence-count]"),
  evidenceCohort: need<HTMLElement>("[data-evidence-cohort]"),
  evidenceShare: need<HTMLElement>("[data-evidence-share]"),
  seedUsable: need<HTMLElement>("[data-seed-usable]"),
  seedAttempts: need<HTMLElement>("[data-seed-attempts]"),
  seedMean: need<HTMLElement>("[data-seed-mean]"),
};

const network = networkOf(TARGET);
const scene = new Scene(ui.figure);

let run = freshTargetRun();
let state: StateId = "map";
let previousFrame = 0;
let announcementTimer = 0;
let animationTarget: number | null = null;
let animationNextState: StateId | null = null;
let animationBudget = 0;
let isAdvancing = false;
let peakOpenedAt = 0;

const routesVisited = new Set<"north" | "south">();
const endpointsSelected = new Set<"A" | "B">();
const bridgesInspected = new Set<BridgeId>();
let selectedRoute: "north" | "south" | null = null;
let selectedBridge: BridgeId | null = null;
let quietPrediction: QuietPrediction | null = null;
let personalRoute: RouteId | null = null;
let comparisonChoice: ComparisonChoice | null = null;

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
  endpointsSelected.clear();
  bridgesInspected.clear();
  selectedRoute = null;
  selectedBridge = null;
  quietPrediction = null;
  personalRoute = null;
  comparisonChoice = null;
  animationTarget = null;
  animationNextState = null;
  animationBudget = 0;
  isAdvancing = false;
  peakOpenedAt = 0;
  run = freshTargetRun();
  scene.setConnectorOpen(false);
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
  scene.setNarrative(state, narrativeShare());
}

function fillEvidence(): void {
  const target = EXPERIMENT.target;
  const control = EXPERIMENT.control;
  const closed = formatDuration(target.closedSeconds);
  const open = formatDuration(target.openSeconds);

  ui.controlSeconds.textContent = String(Math.round(Math.abs(control.deltaSeconds)));
  ui.evidenceClosed.textContent = closed;
  ui.evidenceOpen.textContent = open;
  ui.evidencePercent.textContent = `${target.deltaPercent}%`;
  ui.evidenceCount.textContent = String(target.routeCountsOpen.shortcut);
  ui.evidenceCohort.textContent = String(target.cohortSize);
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

function enter(next: StateId, focusHeading = false): void {
  state = next;
  document.body.dataset.state = next;
  (window as unknown as { storyState?: StateId }).storyState = next;

  const beat = STORY[next];
  ui.eyebrow.textContent = beat.eyebrow;
  ui.headline.textContent = beat.headline;
  ui.body.textContent = beat.body;
  ui.action.textContent = beat.action;
  ui.afterword.hidden = next !== "reveal";

  const showsComparison = next === "quiet_result" || next === "verdict" || next === "reveal";
  ui.comparison.hidden = !showsComparison;
  ui.liveMeasure.hidden = showsComparison;

  renderChapterProgress();
  renderControls();
  renderStateCopy();
  scene.setConnectorOpen(connectorLooksOpen());
  scene.spotlight(currentSpotlight());
  scene.setNarrative(next, narrativeShare());

  if (next === "quiet_result") {
    announce(
      `Quiet-road result: ${formatDuration(EXPERIMENT.control.closedSeconds)} without the road, ` +
        `${formatDuration(EXPERIMENT.control.openSeconds)} with it: ` +
        `${Math.round(Math.abs(EXPERIMENT.control.deltaSeconds))} seconds shorter.`,
    );
  } else if (next === "verdict") {
    announce(
      `Peak result: ${formatDuration(EXPERIMENT.target.closedSeconds)} without the road, ` +
        `${formatDuration(EXPERIMENT.target.openSeconds)} with it: ` +
        `${Math.round(EXPERIMENT.target.deltaSeconds)} seconds longer.`,
    );
  } else {
    announce(`${beat.eyebrow}. ${beat.headline}`);
  }

  if (focusHeading) ui.headline.focus({ preventScroll: true });
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

function renderControls(): void {
  ui.choices.replaceChildren();
  ui.action.disabled = false;

  if (state === "map") {
    ui.choices.append(
      choiceButton(
        "north",
        "Trace north",
        "via Riverside",
        selectedRoute === "north",
        routesVisited.has("north"),
      ),
      choiceButton(
        "south",
        "Trace south",
        "via Millbrook",
        selectedRoute === "south",
        routesVisited.has("south"),
      ),
    );
    ui.action.disabled = routesVisited.size < 2;
  } else if (state === "proposal") {
    ui.choices.append(
      choiceButton(
        "A",
        "Riverside",
        "first endpoint",
        endpointsSelected.has("A"),
        endpointsSelected.has("A"),
      ),
      choiceButton(
        "B",
        "Millbrook",
        "second endpoint",
        endpointsSelected.has("B"),
        endpointsSelected.has("B"),
      ),
    );
    ui.action.disabled = endpointsSelected.size < 2;
  } else if (state === "quiet") {
    ui.choices.append(
      radioGroup<QuietPrediction>(
        "quiet-prediction",
        "Your prediction",
        [
          { value: "help", label: "Trips get faster", detail: "the extra option helps" },
          { value: "same", label: "No real change", detail: "traffic simply redistributes" },
          { value: "hurt", label: "Trips get slower", detail: "the link creates a new queue" },
        ],
        quietPrediction,
      ),
    );
    ui.action.disabled = quietPrediction === null;
  } else if (state === "peak") {
    ui.choices.append(
      radioGroup<RouteId>(
        "personal-route",
        "Which route would you try?",
        [
          { value: "north", label: "North route", detail: "one bridge, long ring road" },
          { value: "shortcut", label: "New middle route", detail: "two bridges, shortest distance" },
          { value: "south", label: "South route", detail: "long ring road, one bridge" },
        ],
        personalRoute,
      ),
    );
    ui.action.disabled = personalRoute === null;
  } else if (state === "compare") {
    ui.choices.append(
      radioGroup<ComparisonChoice>(
        "comparison-design",
        "Choose the fair test",
        [
          {
            value: "road-only",
            label: "Change only the road",
            detail: "same demand, departures and seed",
          },
          {
            value: "different-morning",
            label: "Use another morning",
            detail: "different departures and random choices",
          },
          {
            value: "different-demand",
            label: "Raise demand again",
            detail: "changes traffic and the road together",
          },
        ],
        comparisonChoice,
      ),
    );
    ui.action.disabled = comparisonChoice !== "road-only";
  } else if (state === "diagnose") {
    ui.choices.append(
      choiceButton(
        "SA",
        "Riverside bridge",
        "inspect north approach",
        selectedBridge === "SA",
        bridgesInspected.has("SA"),
      ),
      choiceButton(
        "BT",
        "Millbrook bridge",
        "inspect south approach",
        selectedBridge === "BT",
        bridgesInspected.has("BT"),
      ),
    );
    ui.action.disabled = bridgesInspected.size < 2;
  }

  if (isAdvancing) {
    for (const control of ui.choices.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input, button",
    )) {
      control.disabled = true;
    }
    ui.action.disabled = true;
    ui.action.textContent = "Running traffic wave…";
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
      selectedRoute === null ? "each route · roads empty" : `${selectedRoute} route · roads empty`;
    ui.metricContext.textContent =
      selectedRoute === null
        ? "Different shapes, equal free-flow time."
        : selectedRoute === "north"
          ? "Eastgate → Riverside → North Ring → Central"
          : "Eastgate → South Ring → Millbrook → Central";
    ui.status.textContent =
      routesVisited.size < 2
        ? `Inspect both routes to continue · ${routesVisited.size} of 2 viewed.`
        : "Both routes take the same 305 seconds with no traffic.";
    ui.caption.textContent =
      selectedRoute === null
        ? "Choose a route to trace it on the network."
        : `The ${selectedRoute} route is highlighted. It crosses one narrow bridge.`;
    return;
  }

  if (state === "proposal") {
    const complete = endpointsSelected.size === 2;
    ui.metric.textContent = complete ? "4:34" : "—";
    ui.metricLabel.textContent = complete ? "new route · roads empty" : "choose two endpoints";
    ui.metricContext.textContent = complete
      ? "Thirty-one seconds quicker than either original route when roads are empty."
      : "A useful connector must join the two inner junctions.";
    ui.status.textContent = complete
      ? "The proposal is compelling. Now test whether that benefit survives traffic."
      : `${endpointsSelected.size} of 2 endpoints selected.`;
    ui.caption.textContent = complete
      ? "Your dashed Riverside–Millbrook link creates a third route through the middle."
      : "Select Riverside and Millbrook to complete the proposal.";
    return;
  }

  if (state === "quiet") {
    ui.metric.textContent = "300";
    ui.metricLabel.textContent = "cars per hour · quiet case";
    ui.metricContext.textContent = "Same network and model; only demand is lighter.";
    ui.status.textContent =
      quietPrediction === null
        ? "Record a prediction to run the test."
        : `Prediction recorded: ${predictionLabel(quietPrediction)}.`;
    ui.caption.textContent = "The proposed link is teal. Both bridge approaches have spare room.";
    return;
  }

  if (state === "quiet_result") {
    renderComparison(EXPERIMENT.control);
    ui.metricContext.textContent =
      `Paired result · ${EXPERIMENT.control.routeCountsOpen.shortcut} of ` +
      `${EXPERIMENT.control.cohortSize} measured trips used the link ` +
      `(${EXPERIMENT.control.sharesOpen.shortcut}%).`;
    ui.status.textContent =
      quietPrediction === "help"
        ? "Your prediction matched this low-demand result."
        : "The evidence overturns your prediction for the quiet case.";
    ui.caption.textContent = "At low demand, the extra route spreads traffic without overloading the bridges.";
    return;
  }

  if (state === "peak") {
    ui.metric.textContent = "860";
    ui.metricLabel.textContent = "cars per hour · morning peak";
    ui.metricContext.textContent = "Same road. Nearly three times the quiet-road demand.";
    ui.status.textContent =
      personalRoute === null
        ? "Choose the route you would try after the link opens."
        : `You chose the ${routeLabel(personalRoute)}. The model will make its own seeded choices.`;
    ui.caption.textContent = "Your choice records an intuition; it does not steer any simulated driver.";
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
    ui.metric.textContent = "2";
    ui.metricLabel.textContent = "counterfactual runs";
    ui.metricContext.textContent = "One road closed, one road open. Everything else should match.";
    ui.status.textContent = comparisonStatus();
    ui.caption.textContent = "The live illustration is paused. The verdict comes from complete measured cohorts.";
    return;
  }

  if (state === "verdict") {
    renderComparison(EXPERIMENT.target);
    ui.metricContext.textContent =
      `Paired result · ${EXPERIMENT.target.routeCountsOpen.shortcut} of ` +
      `${EXPERIMENT.target.cohortSize} measured open-road trips chose the link ` +
      `(${EXPERIMENT.target.sharesOpen.shortcut}%).`;
    ui.status.textContent =
      `The 38% is an outcome, not an input. ${personalChoiceReflection()}`;
    ui.caption.textContent =
      "The teal link stays attractive while both old bridge approaches carry shortcut traffic.";
    return;
  }

  if (state === "diagnose") {
    renderDiagnosis();
    return;
  }

  if (state === "recovery") {
    ui.metric.textContent = "0";
    ui.metricLabel.textContent = "post-closure departures yet";
    ui.metricContext.textContent = "Cars already inside the link remain visible until they clear it.";
    ui.status.textContent = "The connector is unavailable to every new route choice.";
    ui.caption.textContent = "The dashed link is closed. Existing cars are not removed from the model.";
    return;
  }

  if (state === "synthesis") {
    const total = run.choiceCountSinceAnchor;
    const shortcut = run.choicesSinceAnchorFor("shortcut");
    ui.metric.textContent = `${Math.round(run.choiceShareSinceAnchor("shortcut") * 100)}%`;
    ui.metricLabel.textContent = "new choices using the closed link";
    ui.metricContext.textContent = `${shortcut} of ${total} post-closure departures.`;
    ui.status.textContent = "The original two-route choice set has returned.";
    ui.caption.textContent = "No new driver can choose the link; any remaining link traffic entered earlier.";
    return;
  }

  renderComparison(EXPERIMENT.target);
  ui.metricContext.textContent =
    `Conditional, not anti-road: at ${EXPERIMENT.control.demandPerHour} cars an hour, ` +
    `the same link saves ${Math.round(Math.abs(EXPERIMENT.control.deltaSeconds))} seconds.`;
  ui.status.textContent =
    `${personalChoiceReflection()} The measured peak average rose ${EXPERIMENT.target.deltaPercent}%.`;
  ui.caption.textContent = "You revealed the name only after observing, testing and explaining the mechanism.";
}

function renderWaveCopy(): void {
  const total = run.choiceCountSinceAnchor;
  const shortcut = run.choicesSinceAnchorFor("shortcut");
  const share = Math.round(run.choiceShareSinceAnchor("shortcut") * 100);
  ui.metric.textContent = `${share}%`;
  ui.metricLabel.textContent = "post-opening route choices";
  ui.metricContext.textContent = `${shortcut} of ${total} departures · one seeded illustrative run`;

  if (state === "wave_one") {
    ui.status.textContent = "The short empty-road time makes the middle route an attractive first guess.";
    ui.caption.textContent = "This percentage counts route decisions as they happen—not only trips that finish first.";
  } else if (state === "wave_two") {
    ui.status.textContent = "Shortcut traffic is added to both bridge approaches, not removed from the network.";
    ui.caption.textContent = "Road width and rust colour show slower traversal; the dots are individual cars.";
  } else if (state === "wave_three") {
    ui.status.textContent = "Choices keep adapting. A complete paired cohort is needed for the final average.";
    ui.caption.textContent = "The live share can move; the later 38% is the measured paired-run outcome.";
  } else {
    ui.status.textContent = "Both bridge approaches are slowing while the connector remains near free-flow.";
    ui.caption.textContent = "Time is compressed; the physics still advances in fixed 0.25-second steps.";
  }
}

function renderDiagnosis(): void {
  if (selectedBridge === null) {
    ui.metric.textContent = "2";
    ui.metricLabel.textContent = "old bridges to inspect";
    ui.metricContext.textContent = "Every shortcut trip crosses both of them.";
    ui.status.textContent = "Inspect Riverside and Millbrook to reconstruct the route shift.";
    ui.caption.textContent = "The queue annotations sit upstream of each narrow bridge.";
    return;
  }

  const counts = bridgeCounts(selectedBridge);
  ui.metric.textContent = `${counts.closed} → ${counts.open}`;
  ui.metricLabel.textContent = `${selectedBridge === "SA" ? "Riverside" : "Millbrook"} bridge trips`;
  ui.metricContext.textContent = "Measured closed-road cohort → measured open-road cohort.";
  ui.status.textContent =
    selectedBridge === "SA"
      ? "North-route traffic plus all 106 shortcut trips use Riverside Road."
      : "South-route traffic plus all 106 shortcut trips use Millbrook Road.";
  ui.caption.textContent =
    bridgesInspected.size === 2
      ? "Both old bottlenecks carry the shortcut flow. You can now close the link."
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

function comparisonStatus(): string {
  if (comparisonChoice === null) return "Pick the design that changes one cause at a time.";
  if (comparisonChoice === "road-only") {
    return "Correct: same demand, departure schedule and random seed; only the road changes.";
  }
  if (comparisonChoice === "different-morning") {
    return "That mixes the road effect with different departures and route-choice randomness.";
  }
  return "That mixes the road effect with a second change in demand.";
}

function predictionLabel(prediction: QuietPrediction): string {
  if (prediction === "help") return "trips get faster";
  if (prediction === "same") return "no real change";
  return "trips get slower";
}

function routeLabel(route: RouteId): string {
  if (route === "shortcut") return "new middle route";
  return `${route} route`;
}

function personalChoiceReflection(): string {
  if (personalRoute === "shortcut") {
    return "Your middle-route choice mirrors the option 106 measured trips found attractive.";
  }
  if (personalRoute === "north" || personalRoute === "south") {
    return `You chose the ${personalRoute} route, but the group-wide route shift still changed its load.`;
  }
  return "The result is produced by the model’s seeded route choices.";
}

function currentSpotlight(): readonly LinkId[] {
  if (state === "map") {
    if (selectedRoute === "north") return ["SA", "AT"];
    if (selectedRoute === "south") return ["SB", "BT"];
    return [];
  }
  if (state === "proposal") {
    if (endpointsSelected.size === 2) return ["AB"];
    if (endpointsSelected.has("A")) return ["SA"];
    if (endpointsSelected.has("B")) return ["BT"];
  }
  if (state === "diagnose" && selectedBridge !== null) return [selectedBridge];
  return STORY[state].spotlight;
}

function connectorLooksOpen(): boolean {
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
    state === "verdict" ||
    state === "diagnose" ||
    state === "recovery" ||
    state === "synthesis" ||
    state === "reveal"
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

  if (state === "map" && (choice === "north" || choice === "south")) {
    selectedRoute = choice;
    routesVisited.add(choice);
    scene.spotlight(currentSpotlight());
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(choice, keyboardActivation);
    announce(`${choice === "north" ? "North" : "South"} route traced. Empty-road time: 5 minutes 5 seconds.`);
    return;
  }

  if (state === "proposal" && (choice === "A" || choice === "B")) {
    if (endpointsSelected.has(choice)) endpointsSelected.delete(choice);
    else endpointsSelected.add(choice);
    scene.spotlight(currentSpotlight());
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(choice, keyboardActivation);
    if (endpointsSelected.size === 2) {
      announce("Proposal complete. The new empty-road route is 31 seconds shorter.");
    }
    return;
  }

  if (state === "diagnose" && (choice === "SA" || choice === "BT")) {
    selectedBridge = choice;
    bridgesInspected.add(choice);
    scene.spotlight(currentSpotlight());
    renderControls();
    renderStateCopy();
    restoreChoiceFocus(choice, keyboardActivation);
    const counts = bridgeCounts(choice);
    announce(
      `${choice === "SA" ? "Riverside" : "Millbrook"} bridge: ` +
        `${counts.closed} measured trips without the link, ${counts.open} with it.`,
    );
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
  } else if (state === "compare" && group === "comparison-design") {
    comparisonChoice = input.value as ComparisonChoice;
  } else {
    return;
  }
  ui.action.disabled =
    (state === "quiet" && quietPrediction === null) ||
    (state === "peak" && personalRoute === null) ||
    (state === "compare" && comparisonChoice !== "road-only");
  renderStateCopy();
}

function onAction(event: MouseEvent): void {
  if (isAdvancing || ui.action.disabled) return;
  const keyboardActivation = event.detail === 0;

  if (state === "map") enter("proposal", keyboardActivation);
  else if (state === "proposal") enter("quiet", keyboardActivation);
  else if (state === "quiet") enter("quiet_result", keyboardActivation);
  else if (state === "quiet_result") enter("peak", keyboardActivation);
  else if (state === "peak") startPeakWaves();
  else if (state === "wave_one") startPeakCheckpoint(1, "wave_two");
  else if (state === "wave_two") startPeakCheckpoint(2, "wave_three");
  else if (state === "wave_three") startPeakCheckpoint(3, "wave_four");
  else if (state === "wave_four") enter("compare", keyboardActivation);
  else if (state === "compare") enter("verdict", keyboardActivation);
  else if (state === "verdict") enter("diagnose", keyboardActivation);
  else if (state === "diagnose") {
    run.setConnectorOpen(false);
    run.setAnchor(run.simTime);
    scene.setConnectorOpen(false);
    enter("recovery", keyboardActivation);
  } else if (state === "recovery") {
    startAnimation(run.simTime + RECOVERY_SECONDS, "synthesis");
  } else if (state === "synthesis") enter("reveal", keyboardActivation);
  else {
    resetInvestigation();
    enter("map", keyboardActivation);
  }
}

function startPeakWaves(): void {
  run = freshTargetRun();
  run.setConnectorOpen(true);
  run.setAnchor(run.simTime);
  peakOpenedAt = run.simTime;
  scene.setConnectorOpen(true);
  startPeakCheckpoint(0, "wave_one");
}

function startPeakCheckpoint(index: number, next: StateId): void {
  const elapsed = WAVE_CHECKPOINTS[index];
  if (elapsed === undefined) throw new Error(`Unknown peak checkpoint: ${index}`);
  startAnimation(peakOpenedAt + elapsed, next);
}

function startAnimation(target: number, next: StateId): void {
  isAdvancing = true;
  animationTarget = target;
  animationNextState = next;
  animationBudget = 0;
  renderControls();
  ui.status.textContent = "Advancing the same fixed-step simulation to the next checkpoint…";

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
  animationTarget = null;
  animationNextState = null;
  animationBudget = 0;
  isAdvancing = false;
  if (next !== null) enter(next);
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
