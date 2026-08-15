// Wires the simulation to the page. This file owns the narrative and nothing else:
// it reads simulation state and writes DOM, never the reverse.

import { TARGET, networkOf } from "./src/experiment/config.ts";
import { EXPERIMENT } from "./src/experiment/result.generated.ts";
import { formatDuration } from "./src/experiment/metrics.ts";
import { LiveRun, TIME_SCALE } from "./src/live.ts";
import type { LinkId, RouteId } from "./src/sim/network.ts";
import { DEFAULT_THROAT, linkFreeFlowTime } from "./src/sim/network.ts";
import { STATES, STORY, shouldAdvance } from "./src/story.ts";
import type { Shows, StateId } from "./src/story.ts";
import { Chart } from "./src/view/chart.ts";
import { Scene, ROAD_NAMES, describeLoad } from "./src/view/scene.ts";
import { currentLayout } from "./src/view/layout.ts";

/**
 * Simulated seconds of settled morning peak to run before the visitor sees
 * anything, so the page opens on a real average rather than an empty map.
 */
const PREROLL_FILL = 400;
const PREROLL_SETTLED = 700;

/** Trips needed before "since you built it" is an average rather than an anecdote. */
const ANCHOR_MINIMUM = 8;

const LOAD_ORDER: readonly LinkId[] = ["SA", "BT", "AT", "SB", "AB"];
const ROUTES: readonly RouteId[] = ["north", "south", "shortcut"];

/**
 * `?speed=N` compresses wall time without touching the simulation: same fixed
 * timestep, same seed, same schedule, same simulated seconds. It exists so browser
 * tests can watch a full adjustment in seconds, and so this is iterable by hand. It
 * cannot change a result — only how long you wait for it.
 */
/**
 * `?nointerp=1` draws the raw simulation state instead of interpolating between
 * steps. Kept as a diagnostic so the smoothing can be demonstrated rather than
 * asserted: it makes the stutter reappear on demand.
 */
const interpolates = new URLSearchParams(window.location.search).get("nointerp") === null;

function requestedTimeScale(): number {
  const raw = new URLSearchParams(window.location.search).get("speed");
  const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : TIME_SCALE;
}

function need<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`missing element: ${selector}`);
  return found;
}

const ui = {
  figure: need<HTMLElement>("[data-figure]"),
  step: need<HTMLElement>("[data-step]"),
  clock: need<HTMLElement>("[data-clock]"),
  routesPanel: need<HTMLElement>("[data-routes-panel]"),
  chartPanel: need<HTMLElement>("[data-chart-panel]"),
  why: need<HTMLElement>("[data-why]"),
  notes: need<HTMLElement>("[data-notes]"),
  headline: need<HTMLElement>("[data-headline]"),
  body: need<HTMLElement>("[data-body]"),
  metric: need<HTMLElement>("[data-metric-value]"),
  metricLabel: need<HTMLElement>("[data-metric-label]"),
  before: need<HTMLElement>("[data-before]"),
  beforeValue: need<HTMLElement>("[data-before-value]"),
  loads: need<HTMLUListElement>("[data-loads]"),
  shortcutRow: need<HTMLElement>('[data-route-row="shortcut"]'),
  action: need<HTMLButtonElement>("[data-action]"),
  note: need<HTMLElement>("[data-note]"),
  findingRows: need<HTMLElement>("[data-finding-rows]"),
  findingKicker: need<HTMLElement>("[data-finding-kicker]"),
  closing: need<HTMLElement>("[data-closing]"),
  controlLine: need<HTMLElement>("[data-control-line]"),
  announce: need<HTMLElement>("[data-announce]"),
  chart: need<HTMLElement>("[data-chart]"),
};

const network = networkOf(TARGET);
const scene = new Scene(ui.figure);
const chart = new Chart(ui.chart);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let run = new LiveRun(TARGET, requestedTimeScale());
let state: StateId = "baseline";
let stateStartedAt = 0;
let baselineSeconds = Number.NaN;
let baselineByRoute: Partial<Record<RouteId, number>> = {};
let anchoredLabel = "average commute";

// ------------------------------------------------------------------- rendering

function applyLayout(): void {
  scene.setLayout(
    currentLayout(),
    {
      streetLength: network.links.SA.length,
      throatStart: network.links.SA.bottleneck?.start ?? network.links.SA.length,
    },
    network,
  );
  scene.spotlight(STORY[state].spotlight);
  scene.setConnectorOpen(run.connectorOpen);
}

/** The road-state list, visually hidden: the map carries this for sighted readers. */
function renderLoads(): void {
  if (ui.loads.children.length === 0) {
    for (const id of LOAD_ORDER) {
      const row = document.createElement("li");
      row.dataset.load = id;
      ui.loads.append(row);
    }
  }
  for (const id of LOAD_ORDER) {
    const row = ui.loads.querySelector<HTMLElement>(`[data-load="${id}"]`);
    if (row === null) continue;
    row.hidden = id === "AB" && !run.connectorOpen;
    const words = describeLoad(run.congestionOf(id)) || "free flowing";
    const next = `${ROAD_NAMES[id]}: ${words}`;
    if (row.textContent !== next) row.textContent = next;
  }
}

function renderRoutes(): void {
  for (const route of ROUTES) {
    const share = run.shareOf(route);
    const cell = document.querySelector<HTMLElement>(`[data-share="${route}"]`);
    if (cell !== null) cell.textContent = `${Math.round(share * 100)}%`;
    const bar = document.querySelector<HTMLElement>(`[data-bar="${route}"]`);
    if (bar !== null) bar.style.transform = `scaleX(${share.toFixed(3)})`;
    // Each route's own current time is what carries the punchline: the drivers who
    // never switched can be seen getting slower, not just told about it.
    const time = document.querySelector<HTMLElement>(`[data-time="${route}"]`);
    if (time !== null) {
      const mean = run.meanSinceAnchorFor(route);
      const ready = run.tripsSinceAnchorFor(route) >= 6 && Number.isFinite(mean);
      time.textContent = ready ? formatDuration(mean) : "";
    }
  }
  ui.shortcutRow.hidden = !run.connectorOpen;
}

function renderReadout(): void {
  // The headline is the running average since the last decision, not a rolling
  // window: a converging number cannot contradict the verdict a minute later. For
  // the first few seconds after a decision that average does not exist yet, so fall
  // back to the recent-arrivals average and move the label with it, keeping the
  // figure and its caption in agreement.
  const anchored = run.meanSinceAnchor();
  const ready = run.anchoredTrips >= ANCHOR_MINIMUM && Number.isFinite(anchored);
  const mean = ready ? anchored : run.meanTravelTime();
  ui.metric.textContent = Number.isFinite(mean) ? formatDuration(mean) : "—";
  ui.metricLabel.textContent =
    ready || state === "baseline" || state === "proposal"
      ? anchoredLabel
      : "average commute, recent arrivals";
  if (visible.chart === true) chart.render(run, baselineSeconds);
  if (visible.routes === true) renderRoutes();
  renderLoads();
  if (visible.clock === true) {
    // Simulated time made visible, in the only unit that needs no metaphor: the
    // peak itself. Nothing here is invented for the sake of a progression device.
    const minutes = Math.max(0, Math.round((run.simTime - openedAt) / 60));
    const next = `${minutes} min into the morning peak`;
    if (ui.clock.textContent !== next) ui.clock.textContent = next;
  }
  // The explanation quotes the same average as the headline, live. It used to
  // freeze when the beat opened, so the two disagreed by ten seconds on screen.
  if (visible.why === true) drawWhy(false);
}

// ----------------------------------------------------------------------- acts

function announce(message: string): void {
  ui.announce.textContent = message;
}

function reveal(heading: HTMLElement): void {
  heading.scrollIntoView({
    behavior: reducedMotion.matches ? "auto" : "smooth",
    block: "center",
  });
  heading.focus({ preventScroll: true });
}

let visible: Shows = {};
let openedAt = 0;

function enter(next: StateId): void {
  state = next;
  stateStartedAt = run.simTime;
  const beat = STORY[next];
  visible = beat.shows;
  document.body.dataset.state = next;

  ui.step.textContent = `${STATES.indexOf(next) + 1} of ${STATES.length} · ${beat.step}`;
  ui.headline.textContent = beat.headline;
  if (beat.body !== undefined) ui.body.textContent = beat.body;
  ui.body.hidden = beat.body === undefined;
  scene.spotlight(beat.spotlight);
  scene.showRoadState(visible.roadState === true);

  // Progressive disclosure, from the state's own declaration: nothing is on screen
  // before it has something to explain.
  ui.before.hidden = visible.before !== true;
  ui.clock.hidden = visible.clock !== true;
  ui.routesPanel.hidden = visible.routes !== true;
  ui.chartPanel.hidden = visible.chart !== true;
  ui.why.hidden = visible.why !== true;
  ui.notes.hidden = visible.notes !== true;
  ui.closing.hidden = next !== "reveal";

  // Hand focus to the headline before hiding the button. Hiding a focused element
  // drops focus to <body>, which stranded a keyboard visitor mid-story: their place
  // was gone and Tab restarted from the top. The headline is where they should be
  // anyway — it is what just changed.
  const hadFocus = document.activeElement === ui.action;
  ui.action.hidden = beat.action === null;
  if (beat.action !== null) ui.action.textContent = beat.action;
  ui.note.hidden = beat.action !== null;
  if (hadFocus && beat.action === null) ui.headline.focus({ preventScroll: true });

  if (visible.why === true) drawWhy(true);
  announce(`${beat.step}. ${beat.headline}`);
  if (next === "result" || next === "reveal") reveal(ui.headline);
}

/** Live commentary while a beat plays, so a visitor knows what to watch. */
function narrate(): void {
  const share = Math.round(run.shareOf("shortcut") * 100);
  let next = "";
  if (state === "opening") {
    next =
      share < 3
        ? "Nobody has tried it yet. Drivers only know the roads they have driven."
        : `${share}% have tried it — and for them it really is quicker.`;
  } else if (state === "adaptation") {
    next = `${share}% now cross both bridges instead of one.`;
  } else if (state === "closed") {
    next =
      share > 5
        ? `${share}% of recent arrivals still crossed it before it shut.`
        : "Everyone is back on the roads they started with.";
  }
  if (next !== "" && ui.note.textContent !== next) {
    ui.note.textContent = next;
    ui.note.hidden = false;
  }
}

function drawWhy(announceIt: boolean): void {
  const now = run.meanSinceAnchor();
  const delta = now - baselineSeconds;
  ui.beforeValue.textContent = formatDuration(baselineSeconds);

  const share = Math.round(run.shareOf("shortcut") * 100);
  const chain = [
    "The link was quicker, on an empty road.",
    `Drivers tried it, got home sooner, and told each other so — ${share}% use it now.`,
    "But it only reaches Central across the far bridge. Everyone who takes it uses both.",
    "Two bridges now carry the traffic one used to. The queues are behind the bridges.",
  ];
  for (const [index, line] of chain.entries()) {
    const cell = document.querySelector<HTMLElement>(`[data-why-${index + 1}]`);
    if (cell !== null && cell.textContent !== line) cell.textContent = line;
  }
  void delta;

  // The punchline. It is not that the average rose — it is that the drivers who
  // never changed route are slower too, and that is measured, not asserted.
  ui.findingRows.replaceChildren();
  const stayers: number[] = [];
  for (const route of ["north", "south"] as const) {
    const before = baselineByRoute[route];
    const after = run.meanSinceAnchorFor(route);
    if (before === undefined || !Number.isFinite(before) || !Number.isFinite(after)) continue;
    const gap = Math.round(after - before);
    const row = document.createElement("li");
    row.className = gap > 0 ? "finding__row finding__row--worse" : "finding__row";
    for (const [cls, text] of [
      ["finding__who", route === "north" ? "Kept to the north bridge" : "Kept to the south bridge"],
      ["finding__then", formatDuration(before)],
      ["finding__now", formatDuration(after)],
      ["finding__gap", gap > 0 ? `+${gap}s` : `${gap}s`],
    ] as const) {
      const cell = document.createElement("span");
      cell.className = cls;
      cell.textContent = text;
      row.append(cell);
    }
    ui.findingRows.append(row);
    if (gap > 0) stayers.push(gap);
  }

  ui.findingKicker.textContent =
    stayers.length === 2
      ? `That is the part that stings. The drivers who never changed route are ` +
        `${stayers[0]} and ${stayers[1]} seconds slower as well. Nobody switched onto a slow ` +
        `road — the link is the emptiest road on the map. They all just ended up sharing two ` +
        `bridges instead of one.`
      : `Look at the link itself: it is the emptiest road on the map. It did not add traffic. It ` +
        `changed where traffic chose to go, and both bridges now carry everyone.`;

}

function onAction(): void {
  if (state === "proposal") {
    baselineSeconds = run.meanSinceAnchor();
    baselineByRoute = {
      north: run.meanSinceAnchorFor("north"),
      south: run.meanSinceAnchorFor("south"),
    };
    ui.before.hidden = false;
    ui.beforeValue.textContent = formatDuration(baselineSeconds);
    run.setConnectorOpen(true);
    scene.setConnectorOpen(true);
    anchoredLabel = "average commute since you built it";
    run.setAnchor(run.simTime);
    openedAt = run.simTime;
    enter("opening");
    return;
  }
  if (state === "result") {
    enter("explanation");
    return;
  }
  if (state === "explanation") {
    run.setConnectorOpen(false);
    scene.setConnectorOpen(false);
    anchoredLabel = "average commute since you closed it";
    run.setAnchor(run.simTime);
    openedAt = run.simTime;
    enter("closed");
    return;
  }
  if (state === "reveal") {
    run = new LiveRun(TARGET, requestedTimeScale());
    preroll();
    scene.setConnectorOpen(false);
    baselineSeconds = Number.NaN;
    baselineByRoute = {};
    anchoredLabel = "average commute";
    enter("baseline");
  }
}

/** Where each self-advancing state hands over to. */
const NEXT: Partial<Record<StateId, StateId>> = {
  baseline: "proposal",
  opening: "adaptation",
  adaptation: "result",
  closed: "reveal",
};

function tick(): void {
  const elapsed = run.simTime - stateStartedAt;
  const next = NEXT[state];
  if (next !== undefined && shouldAdvance(state, run, elapsed)) {
    enter(next);
    return;
  }
  narrate();
}

// ---------------------------------------------------------------------- driver

function preroll(): void {
  // Two stages on purpose. The first fills an empty network, which is not
  // representative of anything; the anchor is set after it, so the average on
  // screen at the first frame already rests on hundreds of settled trips instead
  // of counting up from nothing while the visitor watches.
  run.advanceSimulated(PREROLL_FILL);
  run.setAnchor(run.simTime);
  run.advanceSimulated(PREROLL_SETTLED);
}

let previous = 0;
function frame(now: number): void {
  const wall = previous === 0 ? 0 : (now - previous) / 1000;
  previous = now;
  run.advance(wall);
  // Exposed so a browser test can assert simulated time is really advancing — a
  // frozen simulation and a slow one look identical from the outside.
  (window as unknown as { simulatedSeconds?: number }).simulatedSeconds = run.simTime;
  tick();
  scene.render(run, network, interpolates ? run.stepAlpha : 1);
  renderReadout();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ model note

function fillModelNote(): void {
  const street = linkFreeFlowTime(network.links.SA);
  const parkway = linkFreeFlowTime(network.links.AT);
  const target = EXPERIMENT.target;
  const control = EXPERIMENT.control;
  ui.controlLine.textContent =
    ` — ${Math.abs(control.deltaSeconds).toFixed(0)} seconds faster on average at ` +
    `${control.demandPerHour} cars an hour, against ${target.demandPerHour} here`;

  need<HTMLElement>("[data-model-note]").innerHTML = `
    <p><strong>The network is invented.</strong> It is not Canberra or anywhere else. It is the
    smallest network in which this effect can happen, drawn as a schematic — the ring roads are
    ${(parkway / street).toFixed(1)}× the driving time of the short roads but are not drawn
    ${(parkway / street).toFixed(1)}× longer, so treat the picture as a diagram, not a map.</p>

    <p><strong>The cars follow a published model.</strong> Each one obeys the Intelligent Driver
    Model — Treiber, Hennecke &amp; Helbing, <em>Physical Review E</em> 62 (2000) 1805 — with that
    paper's own parameters for acceleration, braking and jam spacing. Congestion is not a formula
    applied to a road; it is what happens when cars physically queue behind each other. There is no
    equation anywhere in this project that turns traffic volume into a delay, and nothing in the
    code asks whether the new link is open before deciding how slow a road is.</p>

    <p><strong>The bottlenecks are the bridges.</strong> Both short roads narrow to a
    ${DEFAULT_THROAT.length} m pinch with a ${Math.round(DEFAULT_THROAT.speedLimit * 3.6)} km/h
    limit. Capacity is set there, by the speed and following distance drivers keep through it, which
    is the same device the paper above uses to model a capacity drop. Queues stand behind the
    pinches; that is the knot of cars you can see.</p>

    <p><strong>Drivers only know what they have experienced.</strong> Nobody is told the layout or
    which road is busy. Each keeps a running estimate of how long each route takes, updated from
    trips that actually finished, and picks between routes in proportion to
    <span class="mono">exp(−θ × estimated time)</span> — the standard model of route choice under
    uncertainty. A route nobody has driven starts at its empty-road time, which is why the new link
    gets tried at all. Nobody is ever sent down it.</p>

    <p><strong>The before and after are the same experiment.</strong> One frozen configuration,
    measured twice in one run: settle with the link shut, measure, open it on the running network,
    let drivers re-learn, measure again. Same demand, same drivers, same departure times, same
    random seed — each driver even carries the same pre-drawn number for choosing its route. The
    only difference permitted is whether the link is offered, and a test fails if anything else
    differs.</p>

    <p><strong>What the numbers are.</strong> The figure on screen is a live run: the mean of
    everyone who has departed since your last decision, with simulated time running
    ${run.timeScale}× real time. One run is one sample, so the claim comes from the controlled
    experiment instead: over ${target.seeds.count} seeds the link makes the average commute
    <strong>${target.seeds.meanPercent}% worse</strong> (standard deviation
    ${target.seeds.sdPercent}%, range ${target.seeds.minPercent}% to ${target.seeds.maxPercent}%,
    worse on every single seed). A result is reported only if the run settled, every measured trip
    finished, and it survives being re-run over a longer horizon — because a queue that is still
    growing looks exactly like a worse equilibrium if you stop watching at the right moment.</p>

    <p><strong>Two honest numbers, not one.</strong> Opening the link on a town whose drivers have
    already settled produces an adjustment period worse than the equilibrium it decays to: about
    <strong>${EXPERIMENT.transient.target.deltaPercent}%</strong> at first, easing to a few per cent
    once everyone has re-learned (${EXPERIMENT.transient.target.settledPercent}% in this run's
    long-horizon check, ${target.seeds.meanPercent}% averaged over ${target.seeds.count} seeds).
    That is what you watched, because waiting out the decay takes minutes of real time. We checked
    the two agree: run it the other way round, with the link there from the start so nobody has
    habits to unlearn, and it lands on the same equilibrium.</p>

    <p><strong>Everyone, not just the average.</strong> At the new equilibrium the drivers who never
    changed route are slower too — about
    ${Math.abs(EXPERIMENT.transient.target.stayerCostSeconds)} seconds worse for the better-off of
    the two, on every seed tested. That is what makes it a paradox rather than a trade.</p>

    <p><strong>The effect is a few per cent, not a catastrophe.</strong>
    ${formatDuration(target.closedSeconds)} to ${formatDuration(target.openSeconds)}. Braess's
    paradox is a real effect of modest size, and the theoretical worst case for costs of this shape
    is about a third. Any demonstration showing a commute doubling is measuring something else.</p>

    <p><strong>It is conditional, and we checked.</strong> The same code, the same network, at
    ${control.demandPerHour} cars an hour instead of ${target.demandPerHour}, makes the link an
    improvement of ${Math.abs(control.deltaPercent)}% — better on every seed. That control case is
    the evidence that this outcome is computed rather than decided in advance.</p>

    <p><strong>Simplifications worth naming.</strong> One lane each way with no overtaking and no
    lane changing. Every driver is going from Eastgate to Central; there is no other traffic and no
    other destination. Departures are a Poisson process and drivers vary slightly in preferred speed
    and following distance. Nobody re-routes mid-trip except when the link closes underneath them, in
    which case they carry on to the ring road as a sign at the junction would make them.</p>

    <p><strong>Braess's original paper:</strong> D. Braess, “Über ein Paradoxon aus der
    Verkehrsplanung”, <em>Unternehmensforschung</em> 12 (1968) 258–268; in English as Braess,
    Nagurney &amp; Wakolbinger, “On a paradox of traffic planning”, <em>Transportation Science</em>
    39 (2005) 446–450.</p>
  `;
}

// ------------------------------------------------------------------------ boot

ui.action.addEventListener("click", onAction);

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-route]")) {
  const route = button.dataset.route as RouteId;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("pointerenter", () => scene.highlightRoute(route));
  button.addEventListener("pointerleave", () => {
    if (button.getAttribute("aria-pressed") !== "true") scene.highlightRoute(null);
  });
  button.addEventListener("focus", () => scene.highlightRoute(route));
  button.addEventListener("blur", () => {
    if (button.getAttribute("aria-pressed") !== "true") scene.highlightRoute(null);
  });
  // Tapping is not hovering. On a touch screen the only way to inspect a route is
  // to tap it, so a tap latches the same highlight rather than doing nothing.
  button.addEventListener("click", () => {
    const already = button.getAttribute("aria-pressed") === "true";
    for (const other of document.querySelectorAll("[data-route]")) {
      other.setAttribute("aria-pressed", "false");
    }
    button.setAttribute("aria-pressed", already ? "false" : "true");
    scene.highlightRoute(already ? null : route);
  });
}

let resizePending = false;
window.addEventListener("resize", () => {
  // Geometry only. The simulation is not told the window changed, because it has no
  // reason to care — which is what makes a resize mid-run harmless.
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    applyLayout();
  });
});

applyLayout();
fillModelNote();
preroll();
enter("baseline");
requestAnimationFrame(frame);
