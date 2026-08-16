import {
  BASELINE_MINUTES,
  BRAESS_LANDMARKS,
  SHORTCUT_LINK_MINUTES,
  TOTAL_DRIVERS,
  calculateBraess,
  type BraessResult,
} from "./src/braess";

function need<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const input = need<HTMLInputElement>("#shortcut-users");
const shortcutOutput = need<HTMLOutputElement>("[data-shortcut-output]");
const averageTime = need<HTMLOutputElement>("[data-average-time]");
const averageChange = need<HTMLElement>("[data-average-change]");
const decision = need<HTMLElement>("[data-decision]");
const shortcutCount = need<SVGTextElement>("[data-shortcut-count]");
const narrowLabels = [...document.querySelectorAll<SVGTextElement>("[data-narrow-label]")];
const narrowMath = need<HTMLElement>("[data-narrow-math]");
const narrowTimeMath = need<HTMLElement>("[data-narrow-time-math]");
const oldMath = need<HTMLElement>("[data-old-math]");
const shortcutMath = need<HTMLElement>("[data-shortcut-math]");
const averageMath = need<HTMLElement>("[data-average-math]");
const reveal = need<HTMLElement>("[data-reveal]");
const endpointPrompt = need<HTMLElement>("[data-endpoint-prompt]");
const showResult = need<HTMLButtonElement>("[data-show-result]");
const liveSummary = need<HTMLElement>("[data-live-summary]");
const predictionInputs = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="prediction"]'),
];
const discovery = need<HTMLOutputElement>("[data-discovery]");
const townComparison = need<HTMLElement>("[data-town-comparison]");
const comparisonVerdict = need<HTMLOutputElement>("[data-comparison-verdict]");
const predictionFeedback = need<HTMLElement>("[data-prediction-feedback]");
const bestExplanation = need<HTMLElement>("[data-best-explanation]");
const roadControl = need<HTMLElement>("[data-road-control]");
const roadControlTitle = need<HTMLElement>("[data-road-control-title]");
const roadControlCopy = need<HTMLElement>("[data-road-control-copy]");
const closureResult = need<HTMLElement>("[data-closure-result]");
const toggleRoad = need<HTMLButtonElement>("[data-toggle-road]");
const driverLayer = need<SVGGElement>("[data-driver-layer]");
const playButton = need<HTMLButtonElement>("[data-play]");
const topFlow = need<SVGPathElement>("#top-flow");
const bottomFlow = need<SVGPathElement>("#bottom-flow");
const shortcutFlow = need<SVGPathElement>("#shortcut-flow");

const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DRIVERS_PER_DOT = 50;
const PLAY_STEP_MS = 140;
const DOTS = TOTAL_DRIVERS / DRIVERS_PER_DOT;
const BEST_RESULT = calculateBraess(BRAESS_LANDMARKS.bestShortcutUsers);
const driverDots = Array.from({ length: DOTS }, () => {
  const dot = document.createElementNS(SVG_NAMESPACE, "circle");
  dot.setAttribute("r", "5");
  dot.classList.add("driver-dot");
  driverLayer.append(dot);
  return dot;
});
let selectedPrediction: "faster" | "same" | "slower" | null = null;
let roadClosed = false;
let resultRevealed = false;
let playTimer: number | null = null;

function minutes(value: number): string {
  return number.format(value);
}

function drivers(value: number): string {
  return number.format(value);
}

function placeDots(
  dots: SVGCircleElement[],
  path: SVGPathElement,
  route: "top" | "bottom" | "shortcut",
): void {
  const length = path.getTotalLength();
  for (const [index, dot] of dots.entries()) {
    const point = path.getPointAtLength((length * (index + 1)) / (dots.length + 1));
    dot.dataset.route = route;
    dot.classList.toggle("driver-dot--shortcut", route === "shortcut");
    dot.style.transform = `translate(${point.x}px, ${point.y}px)`;
  }
}

function renderDriverDots(shortcutUsers: number): void {
  const shortcutDotCount = Math.min(DOTS, Math.max(0, Math.round(shortcutUsers / DRIVERS_PER_DOT)));
  const remainingDots = DOTS - shortcutDotCount;
  const topEnd = Math.ceil(remainingDots / 2);
  const bottomEnd = remainingDots;
  placeDots(driverDots.slice(0, topEnd), topFlow, "top");
  placeDots(driverDots.slice(topEnd, bottomEnd), bottomFlow, "bottom");
  placeDots(driverDots.slice(bottomEnd), shortcutFlow, "shortcut");
}

function renderDiscovery(result: BraessResult): void {
  const { shortcutUsers, averageMinutes, averageChangeMinutes } = result;
  const { bestShortcutUsers, bestAverageMinutes, breakEvenShortcutUsers } = BRAESS_LANDMARKS;
  averageTime.value = minutes(averageMinutes);

  if (roadClosed) {
    townComparison.dataset.state = "same";
    comparisonVerdict.value = "Back to the original 65 min";
    discovery.value = "The shortcut is closed. Drivers split evenly again, so every trip returns to 65 minutes.";
    return;
  }

  if (averageChangeMinutes < 0) {
    townComparison.dataset.state = "better";
    comparisonVerdict.value = `${minutes(Math.abs(averageChangeMinutes))} min faster`;
  } else if (averageChangeMinutes > 0) {
    townComparison.dataset.state = "worse";
    comparisonVerdict.value = `${minutes(averageChangeMinutes)} min slower`;
  } else {
    townComparison.dataset.state = "same";
    comparisonVerdict.value = "Same as before";
  }

  if (shortcutUsers === 0) {
    discovery.value = "Start moving drivers onto the shortcut.";
  } else if (shortcutUsers < bestShortcutUsers) {
    discovery.value = "The town average is falling. Keep looking for the lowest point.";
  } else if (shortcutUsers === bestShortcutUsers) {
    discovery.value =
      `You found the best balance: ${drivers(bestShortcutUsers)} shortcut users and a ${minutes(bestAverageMinutes)}-minute average. ` +
      `But the shortcut is still ${minutes(BEST_RESULT.individualSavingMinutes)} minutes quicker, so more drivers will switch.`;
  } else if (shortcutUsers < breakEvenShortcutUsers) {
    discovery.value = `You passed the best point. The town is still faster than 65 minutes, but the benefit is shrinking.`;
  } else if (shortcutUsers === breakEvenShortcutUsers) {
    discovery.value = `Break-even: with ${drivers(breakEvenShortcutUsers)} shortcut users, the town is back to 65 minutes.`;
  } else if (shortcutUsers < TOTAL_DRIVERS) {
    discovery.value = "The town is now slower than before, even though the shortcut is still quicker for each driver.";
  } else {
    discovery.value = "Everyone followed the quicker route. The town average is now 15 minutes worse.";
  }
}

function renderPredictionFeedback(): void {
  if (selectedPrediction === null) {
    predictionFeedback.textContent = "You did not need to predict correctly—the slider exposed what happened.";
    return;
  }

  const prediction = {
    faster: "make trips faster",
    same: "make no difference",
    slower: "make trips slower",
  }[selectedPrediction];
  predictionFeedback.textContent =
    `You predicted the shortcut would ${prediction}. ` +
    "It helped while lightly used, but after everyone followed the quicker route the town became slower.";
}

bestExplanation.textContent =
  `The town’s best balance was ${drivers(BRAESS_LANDMARKS.bestShortcutUsers)} shortcut users at ${minutes(BEST_RESULT.averageMinutes)} minutes. ` +
  `It could not last: the shortcut was still ${minutes(BEST_RESULT.individualSavingMinutes)} minutes quicker than an old route, so each next driver had a reason to join it.`;

function render(result: BraessResult): void {
  const {
    shortcutUsers,
    oldRouteUsers,
    narrowRoadUsers,
    narrowRoadMinutes,
    oldRouteMinutes,
    shortcutRouteMinutes,
    averageMinutes,
    individualSavingMinutes,
    averageChangeMinutes,
  } = result;

  document.documentElement.style.setProperty("--shortcut-share", String(shortcutUsers / TOTAL_DRIVERS));
  document.body.dataset.complete = String(shortcutUsers === TOTAL_DRIVERS && !roadClosed);
  document.body.dataset.roadClosed = String(roadClosed);
  shortcutOutput.value = `${drivers(shortcutUsers)} of ${drivers(TOTAL_DRIVERS)}`;
  averageTime.value = minutes(averageMinutes);
  shortcutCount.textContent = `${drivers(shortcutUsers)} drivers`;
  for (const label of narrowLabels) {
    label.textContent = `${drivers(narrowRoadUsers)} cars → ${minutes(narrowRoadMinutes)} min`;
  }
  renderDriverDots(shortcutUsers);
  renderDiscovery(result);
  renderPredictionFeedback();

  if (averageChangeMinutes > 0) {
    averageChange.textContent = `${minutes(averageChangeMinutes)} min slower than without the shortcut`;
  } else if (averageChangeMinutes < 0) {
    averageChange.textContent = `${minutes(Math.abs(averageChangeMinutes))} min better than before`;
  } else {
    averageChange.textContent = "same as before";
  }

  if (roadClosed) {
    decision.textContent = "The shortcut is closed. Drivers must split between the two old routes.";
  } else if (shortcutUsers === 0) {
    decision.textContent =
      `Shortcut: ${minutes(shortcutRouteMinutes)} minutes. Old route: ${minutes(oldRouteMinutes)}. ` +
      `The first driver sees a ${minutes(individualSavingMinutes)}-minute advantage.`;
  } else if (shortcutUsers < TOTAL_DRIVERS) {
    decision.textContent =
      `Shortcut: ${minutes(shortcutRouteMinutes)} minutes. Old route: ${minutes(oldRouteMinutes)}. ` +
      `Switching right now looks ${minutes(individualSavingMinutes)} minutes better.`;
  } else {
    decision.textContent =
      `Staying takes ${minutes(shortcutRouteMinutes)} minutes. Leaving alone would take ` +
      `${minutes(oldRouteMinutes)}. So nobody leaves—even though everyone used to take 65.`;
  }

  narrowMath.textContent =
    `${drivers(shortcutUsers)} + (${drivers(oldRouteUsers)} ÷ 2) = ${drivers(narrowRoadUsers)} cars`;
  narrowTimeMath.textContent = `${drivers(narrowRoadUsers)} ÷ 100 = ${minutes(narrowRoadMinutes)} min`;
  oldMath.textContent = `${minutes(narrowRoadMinutes)} + 45 = ${minutes(oldRouteMinutes)} min`;
  shortcutMath.textContent =
    `${minutes(narrowRoadMinutes)} + ${SHORTCUT_LINK_MINUTES} + ` +
    `${minutes(narrowRoadMinutes)} = ${minutes(shortcutRouteMinutes)} min`;
  averageMath.textContent =
    `(${drivers(oldRouteUsers)} × ${minutes(oldRouteMinutes)} + ` +
    `${drivers(shortcutUsers)} × ${minutes(shortcutRouteMinutes)}) ÷ ` +
    `${drivers(TOTAL_DRIVERS)} = ${minutes(averageMinutes)} min`;

  const reachedEndpoint = shortcutUsers === TOTAL_DRIVERS && !roadClosed;
  endpointPrompt.hidden = !reachedEndpoint || resultRevealed;
  reveal.hidden = !reachedEndpoint || !resultRevealed;
  roadControl.hidden = (!reachedEndpoint || !resultRevealed) && !roadClosed;
  closureResult.hidden = !roadClosed;
  toggleRoad.textContent = roadClosed ? "Reopen the shortcut" : "Close the shortcut";
  roadControlTitle.textContent = roadClosed
    ? "Removing a road made every trip faster."
    : "What happens if the shortcut closes?";
  roadControlCopy.textContent = roadClosed
    ? "Without the tempting middle route, drivers split evenly and stop crowding both narrow roads."
    : "Remove the tempting option and watch all 4,000 drivers redistribute.";
  liveSummary.textContent = roadClosed
    ? "The shortcut is closed. Drivers split evenly. Every trip and the town average are 65 minutes."
    : `${drivers(shortcutUsers)} drivers use the shortcut. ` +
      `Old route ${minutes(oldRouteMinutes)} minutes, shortcut ${minutes(shortcutRouteMinutes)} minutes, ` +
      `town average ${minutes(averageMinutes)} minutes.`;

  if (playTimer === null) {
    playButton.innerHTML = shortcutUsers === TOTAL_DRIVERS
      ? '<span aria-hidden="true">↺</span> Replay from the start'
      : '<span aria-hidden="true">▶</span> Play the full change';
  }
}

input.addEventListener("input", () => {
  stopPlaying();
  roadClosed = false;
  const result = calculateBraess(Number(input.value));
  input.value = String(result.shortcutUsers);
  if (result.shortcutUsers < TOTAL_DRIVERS) resultRevealed = false;
  render(result);
});

showResult.addEventListener("click", () => {
  resultRevealed = true;
  render(calculateBraess(Number(input.value)));
  reveal.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
});

toggleRoad.addEventListener("click", () => {
  stopPlaying();
  roadClosed = !roadClosed;
  input.disabled = roadClosed;
  input.value = roadClosed ? "0" : String(TOTAL_DRIVERS);
  render(calculateBraess(Number(input.value)));
});

function stopPlaying(): void {
  if (playTimer !== null) window.clearTimeout(playTimer);
  playTimer = null;
  playButton.setAttribute("aria-pressed", "false");
}

function playNextStep(): void {
  const current = Number(input.value);
  if (current >= TOTAL_DRIVERS) {
    stopPlaying();
    render(calculateBraess(current));
    return;
  }

  input.value = String(Math.min(TOTAL_DRIVERS, current + 100));
  playTimer = window.setTimeout(playNextStep, PLAY_STEP_MS);
  render(calculateBraess(Number(input.value)));
}

playButton.addEventListener("click", () => {
  if (playTimer !== null) {
    stopPlaying();
    render(calculateBraess(Number(input.value)));
    return;
  }

  roadClosed = false;
  input.disabled = false;
  if (Number(input.value) >= TOTAL_DRIVERS) {
    input.value = "0";
    resultRevealed = false;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    input.value = String(TOTAL_DRIVERS);
    render(calculateBraess(TOTAL_DRIVERS));
    return;
  }

  playButton.innerHTML = '<span aria-hidden="true">❚❚</span> Pause';
  playButton.setAttribute("aria-pressed", "true");
  playNextStep();
});

for (const predictionInput of predictionInputs) {
  predictionInput.addEventListener("change", () => {
    selectedPrediction =
      predictionInput.value === "faster" || predictionInput.value === "same"
        ? predictionInput.value
        : "slower";
    renderPredictionFeedback();
  });
}

render(calculateBraess(Number(input.value)));

Object.defineProperty(window, "braessModel", {
  value: Object.freeze({
    totalDrivers: TOTAL_DRIVERS,
    baselineMinutes: BASELINE_MINUTES,
    calculate: calculateBraess,
  }),
  writable: false,
});
