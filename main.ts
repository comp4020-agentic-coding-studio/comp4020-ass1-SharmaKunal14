import {
  BASELINE_MINUTES,
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
const oldTime = need<HTMLOutputElement>("[data-old-time]");
const shortcutTime = need<HTMLOutputElement>("[data-shortcut-time]");
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
const liveSummary = need<HTMLElement>("[data-live-summary]");

const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

function minutes(value: number): string {
  return number.format(value);
}

function drivers(value: number): string {
  return number.format(value);
}

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
  document.body.dataset.complete = String(shortcutUsers === TOTAL_DRIVERS);
  shortcutOutput.value = `${drivers(shortcutUsers)} of ${drivers(TOTAL_DRIVERS)}`;
  oldTime.value = minutes(oldRouteMinutes);
  shortcutTime.value = minutes(shortcutRouteMinutes);
  averageTime.value = minutes(averageMinutes);
  shortcutCount.textContent = `${drivers(shortcutUsers)} drivers`;
  for (const label of narrowLabels) {
    label.textContent = `${drivers(narrowRoadUsers)} cars → ${minutes(narrowRoadMinutes)} min`;
  }

  if (averageChangeMinutes > 0) {
    averageChange.textContent = `${minutes(averageChangeMinutes)} min slower than without the shortcut`;
  } else if (averageChangeMinutes < 0) {
    averageChange.textContent = `${minutes(Math.abs(averageChangeMinutes))} min better than before`;
  } else {
    averageChange.textContent = "same as before";
  }

  if (shortcutUsers === 0) {
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

  narrowMath.textContent = `(${drivers(TOTAL_DRIVERS)} + ${drivers(shortcutUsers)}) ÷ 2 = ${drivers(narrowRoadUsers)}`;
  narrowTimeMath.textContent = `${drivers(narrowRoadUsers)} ÷ 100 = ${minutes(narrowRoadMinutes)} min`;
  oldMath.textContent = `${minutes(narrowRoadMinutes)} + 45 = ${minutes(oldRouteMinutes)} min`;
  shortcutMath.textContent = `${minutes(narrowRoadMinutes)} + ${minutes(narrowRoadMinutes)} = ${minutes(shortcutRouteMinutes)} min`;
  averageMath.textContent =
    `(${drivers(oldRouteUsers)} × ${minutes(oldRouteMinutes)} + ` +
    `${drivers(shortcutUsers)} × ${minutes(shortcutRouteMinutes)}) ÷ ` +
    `${drivers(TOTAL_DRIVERS)} = ${minutes(averageMinutes)} min`;

  reveal.hidden = shortcutUsers !== TOTAL_DRIVERS;
  liveSummary.textContent =
    `${drivers(shortcutUsers)} drivers use the shortcut. ` +
    `Old route ${minutes(oldRouteMinutes)} minutes, shortcut ${minutes(shortcutRouteMinutes)} minutes, ` +
    `town average ${minutes(averageMinutes)} minutes.`;
}

input.addEventListener("input", () => {
  const result = calculateBraess(Number(input.value));
  input.value = String(result.shortcutUsers);
  render(result);
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
