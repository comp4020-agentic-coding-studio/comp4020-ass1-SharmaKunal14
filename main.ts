import {
  BASELINE_MINUTES,
  BRAESS_LANDMARKS,
  SHORTCUT_LINK_MINUTES,
  TOTAL_DRIVERS,
  calculateBraess,
  type BraessResult,
} from "./src/braess";

function need<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const input = need<HTMLInputElement>("#shortcut-users");
const shortcutOutput = need<HTMLOutputElement>("[data-shortcut-output]");
const topRouteLedger = need<HTMLOutputElement>("[data-top-route-ledger]");
const shortcutRouteLedger = need<HTMLOutputElement>("[data-shortcut-route-ledger]");
const bottomRouteLedger = need<HTMLOutputElement>("[data-bottom-route-ledger]");
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
const challengeStep = need<HTMLElement>("[data-challenge-step]");
const challengeTitle = need<HTMLElement>("[data-challenge-title]");
const challengeCopy = need<HTMLElement>("[data-challenge-copy]");
const milestones = [...document.querySelectorAll<HTMLElement>("[data-milestone]")];
const liveSummary = need<HTMLElement>("[data-live-summary]");
const discovery = need<HTMLOutputElement>("[data-discovery]");
const townComparison = need<HTMLElement>("[data-town-comparison]");
const comparisonVerdict = need<HTMLOutputElement>("[data-comparison-verdict]");
const bestExplanation = need<HTMLElement>("[data-best-explanation]");
const roadControl = need<HTMLElement>("[data-road-control]");
const roadControlTitle = need<HTMLElement>("[data-road-control-title]");
const roadControlCopy = need<HTMLElement>("[data-road-control-copy]");
const toggleRoad = need<HTMLButtonElement>("[data-toggle-road]");
const networkState = need<HTMLElement>("[data-network-state]");
const networkWrap = need<HTMLElement>("[data-network-wrap]");
const mapProof = need<HTMLElement>("[data-map-proof]");
const network = need<SVGSVGElement>("[data-network]");
const spotlightCopy = need<HTMLElement>("[data-spotlight-copy]");
const spotlightButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-spotlight]")];
const rescuePrompt = need<HTMLElement>("[data-rescue-prompt]");
const rescueInstruction = need<HTMLElement>("[data-rescue-instruction]");
const rescueResult = need<HTMLElement>("[data-rescue-result]");
const rescueAverage = need<HTMLElement>("[data-rescue-average]");
const rescueOld = need<HTMLElement>("[data-rescue-old]");
const rescueLoss = need<HTMLElement>("[data-rescue-loss]");
const startRescue = need<HTMLButtonElement>("[data-start-rescue]");
const finishRescue = need<HTMLButtonElement>("[data-finish-rescue]");
const driverLayer = need<SVGGElement>("[data-driver-layer]");
const topFlow = need<SVGPathElement>("#top-flow");
const bottomFlow = need<SVGPathElement>("#bottom-flow");
const shortcutFlow = need<SVGPathElement>("#shortcut-flow");

const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DRIVERS_PER_DOT = 50;
const DOTS = TOTAL_DRIVERS / DRIVERS_PER_DOT;
const DOTS_PER_OLD_ROUTE = DOTS / 2;
const BEST_RESULT = calculateBraess(BRAESS_LANDMARKS.bestShortcutUsers);
const RESCUE_SHORTCUT_USERS = TOTAL_DRIVERS - 100;
const RESCUE_RESULT = calculateBraess(RESCUE_SHORTCUT_USERS);
const driverDots = Array.from({ length: DOTS }, (_, index) => {
  const dot = document.createElementNS(SVG_NAMESPACE, "circle");
  dot.setAttribute("r", "5");
  dot.classList.add("driver-dot");
  dot.dataset.origin = index < DOTS_PER_OLD_ROUTE ? "top" : "bottom";
  driverLayer.append(dot);
  return dot;
});
const topOriginDots = driverDots.slice(0, DOTS_PER_OLD_ROUTE);
const bottomOriginDots = driverDots.slice(DOTS_PER_OLD_ROUTE);
let roadClosed = false;
let resultRevealed = false;
let rescueMode = false;
let furthestShortcutUsers = 0;
let activeSpotlight: string | null = null;

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

function renderDriverDots(shortcutUsers: number, usersPerOldRoute: number): void {
  const oldRouteDots = usersPerOldRoute / DRIVERS_PER_DOT;
  const topDotsOnShortcut = topOriginDots.slice(oldRouteDots);
  const bottomDotsOnShortcut = bottomOriginDots.slice(oldRouteDots);

  placeDots(topOriginDots.slice(0, oldRouteDots), topFlow, "top");
  placeDots(bottomOriginDots.slice(0, oldRouteDots), bottomFlow, "bottom");
  placeDots([...topDotsOnShortcut, ...bottomDotsOnShortcut], shortcutFlow, "shortcut");

  topRouteLedger.value = `${drivers(usersPerOldRoute)} drivers · ${drivers(oldRouteDots)} dots`;
  shortcutRouteLedger.value =
    `${drivers(shortcutUsers)} drivers · ${drivers(shortcutUsers / DRIVERS_PER_DOT)} dots`;
  bottomRouteLedger.value = `${drivers(usersPerOldRoute)} drivers · ${drivers(oldRouteDots)} dots`;
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

function renderMilestones(result: BraessResult): void {
  const definitions = [
    {
      id: "best",
      threshold: BRAESS_LANDMARKS.bestShortcutUsers,
      complete: `${minutes(BEST_RESULT.averageMinutes)} min found`,
    },
    {
      id: "break-even",
      threshold: BRAESS_LANDMARKS.breakEvenShortcutUsers,
      complete: "65 min found",
    },
    { id: "paradox", threshold: TOTAL_DRIVERS, complete: "80 min created" },
  ];

  let nextFound = false;
  for (const definition of definitions) {
    const milestone = milestones.find((item) => item.dataset.milestone === definition.id);
    if (milestone === undefined) throw new Error(`Missing milestone: ${definition.id}`);
    const completed = furthestShortcutUsers >= definition.threshold;
    const active = !completed && !nextFound;
    if (active) nextFound = true;
    milestone.dataset.state = completed ? "complete" : active ? "active" : "locked";
    milestone.toggleAttribute("aria-current", active);
    const status = need<HTMLElement>("[data-milestone-status]", milestone);
    status.textContent = completed ? definition.complete : active ? "Find it" : "Locked";
  }

  if (rescueMode) {
    challengeStep.textContent = "Step 4 · Attempt a rescue";
    challengeTitle.textContent = "Can 100 drivers improve things for everyone?";
    challengeCopy.textContent = "Move the slider one step left and compare the town’s result with those drivers’ result.";
  } else if (furthestShortcutUsers < BRAESS_LANDMARKS.bestShortcutUsers) {
    challengeStep.textContent = "Step 1 · Find the best point";
    challengeTitle.textContent = "Can you make the town as fast as possible?";
    challengeCopy.textContent = "Drag slowly and watch the town average. Stop when it reaches its lowest value.";
  } else if (furthestShortcutUsers < BRAESS_LANDMARKS.breakEvenShortcutUsers) {
    challengeStep.textContent = "Step 2 · Find break-even";
    challengeTitle.textContent = "When does the shortcut stop helping?";
    challengeCopy.textContent = "Keep moving drivers until the town average returns to its original 65 minutes.";
  } else if (furthestShortcutUsers < TOTAL_DRIVERS) {
    challengeStep.textContent = "Step 3 · Follow the quicker route";
    challengeTitle.textContent = "What happens if drivers keep choosing for themselves?";
    challengeCopy.textContent = "The shortcut still looks quicker to each driver. Keep following that incentive.";
  } else {
    challengeStep.textContent = "Step 3 · Paradox created";
    challengeTitle.textContent = "You followed the quicker route—and made the town slower.";
    challengeCopy.textContent = result.shortcutUsers === TOTAL_DRIVERS
      ? "The same 4,000 drivers now take 80 minutes instead of 65."
      : "Return the slider to 4,000 to reveal the controlled comparison.";
  }
}

function renderRescue(result: BraessResult): void {
  document.body.dataset.rescue = String(rescueMode);
  rescuePrompt.hidden = !rescueMode;
  if (!rescueMode) return;

  const targetReached = result.shortcutUsers === RESCUE_SHORTCUT_USERS;
  rescueResult.hidden = !targetReached;
  finishRescue.hidden = !targetReached;
  rescueInstruction.textContent = targetReached
    ? "You moved one 100-driver group back. Now compare the two consequences."
    : `Set the slider to ${drivers(RESCUE_SHORTCUT_USERS)}: exactly one step left from ${drivers(TOTAL_DRIVERS)}.`;
  rescueAverage.textContent = `${minutes(RESCUE_RESULT.averageMinutes)} min`;
  rescueOld.textContent = `${minutes(RESCUE_RESULT.oldRouteMinutes)} min`;
  rescueLoss.textContent = `${minutes(RESCUE_RESULT.individualSavingMinutes)} min worse for them`;
}

const SPOTLIGHTS: Record<string, { map: string; dots: string; copy: string }> = {
  top: {
    map: "top",
    dots: "top",
    copy: "These drivers use the upper narrow road and one fixed 45-minute road.",
  },
  shortcut: {
    map: "shortcut",
    dots: "shortcut",
    copy: "These shortcut drivers use both narrow roads and the 0-minute connector.",
  },
  bottom: {
    map: "bottom",
    dots: "bottom",
    copy: "These drivers use one fixed 45-minute road and the lower narrow road.",
  },
  "narrow-load": {
    map: "narrow",
    dots: "all",
    copy: "Both narrow roads glow because the shortcut sends every shortcut driver through both of them.",
  },
  "narrow-time": {
    map: "narrow",
    dots: "all",
    copy: "Both narrow roads use the same rule: 100 cars add 1 minute.",
  },
  "old-route": {
    map: "top",
    dots: "top",
    copy: "One old route combines one narrow road with one fixed 45-minute road.",
  },
  "shortcut-route": {
    map: "shortcut",
    dots: "shortcut",
    copy: "The shortcut route crosses both narrow roads plus the 0-minute connector.",
  },
  "town-average": {
    map: "all",
    dots: "all",
    copy: "Every route and every driver count toward the town average.",
  },
};

function renderSpotlight(): void {
  const spotlight = activeSpotlight === null ? null : SPOTLIGHTS[activeSpotlight];
  if (activeSpotlight !== null && spotlight === undefined) {
    throw new Error(`Unknown spotlight: ${activeSpotlight}`);
  }
  network.dataset.focus = spotlight?.map ?? "";
  driverLayer.dataset.focus = spotlight?.dots ?? "";
  spotlightCopy.textContent = spotlight?.copy ??
    "Each 100-driver slider step moves two existing dots—one from each old route—onto the shortcut.";
  for (const button of spotlightButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.spotlight === activeSpotlight));
  }
}

bestExplanation.textContent =
  `The town’s best balance was ${drivers(BRAESS_LANDMARKS.bestShortcutUsers)} shortcut users at ${minutes(BEST_RESULT.averageMinutes)} minutes. ` +
  `It could not last: the shortcut was still ${minutes(BEST_RESULT.individualSavingMinutes)} minutes quicker than an old route, so each next driver had a reason to join it.`;

function render(result: BraessResult): void {
  const {
    shortcutUsers,
    oldRouteUsers,
    usersPerOldRoute,
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
  renderDriverDots(shortcutUsers, usersPerOldRoute);
  renderDiscovery(result);
  renderMilestones(result);
  renderRescue(result);
  renderSpotlight();

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
  const showResultChapter = resultRevealed && (reachedEndpoint || roadClosed);
  endpointPrompt.hidden = !reachedEndpoint || resultRevealed || rescueMode;
  reveal.hidden = !showResultChapter;
  roadControl.hidden = !showResultChapter;
  mapProof.hidden = !roadClosed;
  toggleRoad.setAttribute("aria-checked", String(!roadClosed));
  toggleRoad.setAttribute(
    "aria-label",
    roadClosed
      ? "Shortcut is closed. Select to reopen it and watch the map."
      : "Shortcut is open. Select to close it and watch the map.",
  );
  networkState.textContent = roadClosed ? "Closed" : "Open";
  roadControlTitle.textContent = roadClosed
    ? "You proved it backwards."
    : "Now remove the shortcut.";
  roadControlCopy.textContent = roadClosed
    ? "The same drivers returned to 65 minutes when the shortcut disappeared."
    : "Keep the same 4,000 drivers and watch the two old routes clear.";
  liveSummary.textContent = roadClosed
    ? "The shortcut is closed. Drivers split evenly. Every trip and the town average are 65 minutes."
    : reachedEndpoint
      ? "All 4,000 drivers use the shortcut. The town average is 80 minutes. The paradox comparison is ready beside the slider."
      : `${drivers(shortcutUsers)} drivers use the shortcut. ` +
      `Old route ${minutes(oldRouteMinutes)} minutes, shortcut ${minutes(shortcutRouteMinutes)} minutes, ` +
      `town average ${minutes(averageMinutes)} minutes.`;

}

input.addEventListener("input", () => {
  roadClosed = false;
  const result = calculateBraess(Number(input.value));
  input.value = String(result.shortcutUsers);
  furthestShortcutUsers = Math.max(furthestShortcutUsers, result.shortcutUsers);
  if (result.shortcutUsers < TOTAL_DRIVERS) resultRevealed = false;
  render(result);
});

startRescue.addEventListener("click", () => {
  roadClosed = false;
  rescueMode = true;
  resultRevealed = false;
  input.disabled = false;
  input.value = String(TOTAL_DRIVERS);
  render(calculateBraess(TOTAL_DRIVERS));
  input.focus({ preventScroll: true });
  input.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
});

finishRescue.addEventListener("click", () => {
  rescueMode = false;
  resultRevealed = true;
  input.value = String(TOTAL_DRIVERS);
  render(calculateBraess(TOTAL_DRIVERS));
  reveal.focus({ preventScroll: true });
  reveal.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
});

for (const button of spotlightButtons) {
  button.addEventListener("click", () => {
    const requested = button.dataset.spotlight;
    if (requested === undefined || SPOTLIGHTS[requested] === undefined) return;
    activeSpotlight = activeSpotlight === requested ? null : requested;
    renderSpotlight();
  });
}

showResult.addEventListener("click", () => {
  resultRevealed = true;
  render(calculateBraess(Number(input.value)));
  reveal.focus({ preventScroll: true });
  reveal.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
});

toggleRoad.addEventListener("click", () => {
  activeSpotlight = null;
  roadClosed = !roadClosed;
  input.disabled = roadClosed;
  input.value = roadClosed ? "0" : String(TOTAL_DRIVERS);
  render(calculateBraess(Number(input.value)));
  const destination = roadClosed ? mapProof : networkWrap;
  destination.focus({ preventScroll: true });
  networkWrap.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
});

render(calculateBraess(Number(input.value)));

Object.defineProperty(window, "braessModel", {
  value: Object.freeze({
    totalDrivers: TOTAL_DRIVERS,
    baselineMinutes: BASELINE_MINUTES,
    calculate: calculateBraess,
  }),
  writable: false,
});
