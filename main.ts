// Wires the simulation to the page. This file owns the narrative state machine
// and nothing else: it reads simulation state and writes DOM, never the reverse.

import { TARGET, networkOf } from "./src/experiment/config.ts";
import { EXPERIMENT } from "./src/experiment/result.generated.ts";
import { formatDuration } from "./src/experiment/metrics.ts";
import { LiveRun, TIME_SCALE, WINDOW_TRIPS } from "./src/live.ts";
import type { LinkId, RouteId } from "./src/sim/network.ts";
import { DEFAULT_THROAT, linkFreeFlowTime } from "./src/sim/network.ts";
import { Chart } from "./src/view/chart.ts";
import { Scene, ROAD_NAMES } from "./src/view/scene.ts";
import { layoutFor } from "./src/view/layout.ts";

/**
 * Simulated seconds of settled morning peak to run before the visitor sees
 * anything. Without it the first twenty seconds of the page are a network filling
 * up from empty, and the average commute on screen means nothing yet.
 */
const PREROLL = 900;

/**
 * Simulated seconds before the verdict may be drawn at all, and the point at
 * which it is drawn regardless.
 *
 * The reveal waits for the readout to *settle*, not for a countdown — see
 * `LiveRun.hasSettledSince`. These only bound the wait: long enough that a
 * verdict is never drawn on an average that has not caught up, capped so an
 * unlucky run cannot leave a visitor watching forever.
 */
const ADAPT_MIN = 1100;
const ADAPT_MAX = 2600;
/** The same, for the recovery after the road closes. */
const RECOVER_MIN = 800;
const RECOVER_MAX = 1800;

type Phase = "before" | "adapting" | "worse" | "recovering" | "done";

/**
 * `?speed=N` compresses wall time without touching the simulation: same fixed
 * timestep, same seed, same schedule, same simulated seconds. It exists so the
 * browser tests can watch a full 900-second adaptation in a couple of seconds
 * instead of thirty-six, and so this is iterable by hand. It cannot change a
 * result — only how long you wait for it.
 */
function requestedTimeScale(): number {
  const raw = new URLSearchParams(window.location.search).get("speed");
  const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : TIME_SCALE;
}

const LOAD_ORDER: readonly LinkId[] = ["SA", "BT", "AT", "SB", "AB"];

function need<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`missing element: ${selector}`);
  return found;
}

const ui = {
  figure: need<HTMLElement>("[data-figure]"),
  metric: need<HTMLElement>("[data-metric-value]"),
  metricLabel: need<HTMLElement>("[data-metric-label]"),
  before: need<HTMLElement>("[data-before]"),
  beforeValue: need<HTMLElement>("[data-before-value]"),
  loads: need<HTMLUListElement>("[data-loads]"),
  routes: need<HTMLElement>("[data-routes]"),
  shortcutRow: need<HTMLElement>('[data-route-row="shortcut"]'),
  prompt: need<HTMLElement>("[data-prompt]"),
  action: need<HTMLButtonElement>("[data-action]"),
  note: need<HTMLElement>("[data-note]"),
  verdict: need<HTMLElement>("[data-verdict]"),
  verdictHeadline: need<HTMLElement>("[data-verdict-headline]"),
  verdictBody: need<HTMLElement>("[data-verdict-body]"),
  chain: need<HTMLElement>("[data-chain]"),
  closing: need<HTMLElement>("[data-closing]"),
  closingName: need<HTMLElement>("[data-closing-name]"),
  controlLine: need<HTMLElement>("[data-control-line]"),
  announce: need<HTMLElement>("[data-announce]"),
  chart: need<HTMLElement>("[data-chart]"),
};

const network = networkOf(TARGET);
const scene = new Scene(ui.figure);
const chart = new Chart(ui.chart);
let run = new LiveRun(TARGET, requestedTimeScale());
let phase: Phase = "before";
let phaseStartedAt = 0;
let baselineSeconds = Number.NaN;
let anchoredLabel = "average commute";

// ------------------------------------------------------------------- rendering

function applyLayout(): void {
  const box = ui.figure.getBoundingClientRect();
  scene.setLayout(
    layoutFor(box.width || 1, box.height || 1),
    {
      streetLength: network.links.SA.length,
      throatStart: network.links.SA.bottleneck?.start ?? network.links.SA.length,
    },
    network,
  );
}

function renderLoads(): void {
  if (ui.loads.children.length === 0) {
    for (const id of LOAD_ORDER) {
      const row = document.createElement("li");
      row.className = "load";
      row.dataset.load = id;
      row.innerHTML =
        `<span class="load__name"></span>` +
        `<span class="load__bar" aria-hidden="true"><i></i></span>` +
        `<span class="load__state"></span>`;
      const name = row.querySelector<HTMLElement>(".load__name");
      if (name !== null) name.textContent = ROAD_NAMES[id];
      ui.loads.append(row);
    }
  }
  for (const id of LOAD_ORDER) {
    const row = ui.loads.querySelector<HTMLElement>(`[data-load="${id}"]`);
    if (row === null) continue;
    const isConnector = id === "AB";
    row.hidden = isConnector && !run.connectorOpen;
    const ratio = run.congestionOf(id);
    const bar = row.querySelector<HTMLElement>(".load__bar i");
    if (bar !== null) bar.style.width = `${Math.min(100, (ratio - 1) * 90 + 4).toFixed(0)}%`;
    const state = row.querySelector<HTMLElement>(".load__state");
    if (state !== null) state.textContent = describeLoad(ratio);
    row.classList.toggle("load--slow", ratio > 1.25);
    row.classList.toggle("load--crawling", ratio > 1.8);
  }
}

/** Words, not just a colour or a bar: the state has to survive being read aloud. */
function describeLoad(ratio: number): string {
  if (ratio < 1.08) return "free flowing";
  if (ratio < 1.25) return "slowing";
  if (ratio < 1.8) return `${ratio.toFixed(1)}× slower`;
  return `queueing, ${ratio.toFixed(1)}× slower`;
}

/** Trips needed before "since you built it" is an average rather than an anecdote. */
const ANCHOR_MINIMUM = 8;

function renderReadout(): void {
  // The headline is the running average since the last decision, not a rolling
  // window: a converging number cannot contradict the verdict a minute later.
  //
  // For the first few seconds after a decision, nobody has completed a trip since
  // it, so that average does not exist yet. Rather than blank the number at the
  // exact moment the visitor acts, fall back to the recent-arrivals average — and
  // move the label with it, so the figure on screen always matches its caption.
  const anchored = run.meanSinceAnchor();
  const ready = run.anchoredTrips >= ANCHOR_MINIMUM && Number.isFinite(anchored);
  const mean = ready ? anchored : run.meanTravelTime();
  ui.metric.textContent = Number.isFinite(mean) ? formatDuration(mean) : "—";
  ui.metricLabel.textContent = ready ? anchoredLabel : "average commute, recent arrivals";
  for (const route of ["north", "south", "shortcut"] as const) {
    const cell = document.querySelector<HTMLElement>(`[data-share="${route}"]`);
    if (cell !== null) cell.textContent = `${Math.round(run.shareOf(route) * 100)}%`;
  }
  ui.shortcutRow.hidden = !run.connectorOpen;
  chart.render(run, baselineSeconds);
  renderLoads();
}

// -------------------------------------------------------------------- phases

function announce(message: string): void {
  ui.announce.textContent = message;
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Bring a newly revealed region into view and put focus on it. */
function reveal(heading: HTMLElement): void {
  heading.scrollIntoView({
    behavior: reducedMotion.matches ? "auto" : "smooth",
    block: "center",
  });
  heading.focus({ preventScroll: true });
}

function setPhase(next: Phase): void {
  phase = next;
  phaseStartedAt = run.simTime;
  document.body.dataset.phase = next;

  if (next === "adapting") {
    anchoredLabel = "average commute since you built it";
    ui.action.hidden = true;
    ui.note.hidden = false;
    ui.note.textContent = "The link is open. Drivers are finding out whether it is quicker.";
    announce("The road is open. Drivers are starting to change route.");
  }

  if (next === "worse") {
    drawVerdict();
    ui.action.hidden = false;
    ui.action.textContent = "Close the road";
    ui.note.hidden = true;
    // Move focus to the reveal, not to the button: a keyboard visitor should meet
    // the outcome, and the next Tab from here is "Close the road".
    reveal(ui.verdictHeadline);
  }

  if (next === "recovering") {
    anchoredLabel = "average commute since you closed it";
    run.setAnchor(run.simTime);
    ui.action.hidden = true;
    ui.note.hidden = false;
    ui.note.textContent = "The link is shut. Drivers are going back to what they knew.";
    announce("The road is closed again. Watch the average come back down.");
  }

  if (next === "done") {
    ui.closing.hidden = false;
    reveal(ui.closingName);
    ui.action.hidden = false;
    ui.action.textContent = "Run it again";
    ui.note.hidden = true;
    announce(
      `With the link closed again the average commute is ${formatDuration(run.meanSinceAnchor())}. ` +
        `This is Braess's paradox.`,
    );
  }
}

function drawVerdict(): void {
  const now = run.meanSinceAnchor();
  const delta = now - baselineSeconds;
  const percent = (delta / baselineSeconds) * 100;
  ui.before.hidden = false;
  ui.beforeValue.textContent = formatDuration(baselineSeconds);
  ui.verdict.hidden = false;
  ui.chain.hidden = false;

  // The copy is written from what this run measured, not from what we hoped it
  // would. A live run is one sample and its average wanders; if it came out flat
  // the page says so and leans on the controlled experiment instead of claiming
  // something the visitor cannot see.
  const equilibrium = EXPERIMENT.target.seeds.meanPercent;
  if (delta > 4) {
    ui.verdictHeadline.textContent = "You built the road. Everyone got home later.";
    ui.verdictBody.textContent =
      `The average commute went from ${formatDuration(baselineSeconds)} to ` +
      `${formatDuration(now)} — ${Math.round(delta)} seconds worse, ` +
      `${percent.toFixed(1)}% — with exactly the same number of drivers on exactly the same ` +
      `network, plus one short road that nobody is queueing on. ` +
      `Some of that is the upheaval: drivers are still re-learning, and the adjustment is the ` +
      `worst part of it. Left alone for long enough this network settles about ` +
      `${equilibrium}% worse than it started. Both numbers are worse. Nobody ends up better off.`;
  } else if (delta > -4) {
    ui.verdictHeadline.textContent = "You built the road. Nobody got home sooner.";
    ui.verdictBody.textContent =
      `This run came out about level: ${formatDuration(baselineSeconds)} before, ` +
      `${formatDuration(now)} now. A single run is one sample and its average wanders by more ` +
      `than the effect. Run as a controlled experiment over ${EXPERIMENT.target.seeds.count} ` +
      `seeds, the same network settles ${EXPERIMENT.target.seeds.meanPercent}% worse with the ` +
      `link open — worse on every seed.`;
  } else {
    ui.verdictHeadline.textContent = "In this run, the road helped.";
    ui.verdictBody.textContent =
      `${formatDuration(baselineSeconds)} before, ${formatDuration(now)} now. That happens: the ` +
      `effect is a few per cent and one run is one sample. Across ` +
      `${EXPERIMENT.target.seeds.count} seeds the same network settles ` +
      `${EXPERIMENT.target.seeds.meanPercent}% worse with the link open.`;
  }
  announce(`${ui.verdictHeadline.textContent} ${ui.verdictBody.textContent}`);
}

function onAction(): void {
  if (phase === "before") {
    baselineSeconds = run.meanSinceAnchor();
    run.setAnchor(run.simTime);
    ui.before.hidden = false;
    ui.beforeValue.textContent = formatDuration(baselineSeconds);
    run.setConnectorOpen(true);
    scene.setConnectorOpen(true);
    setPhase("adapting");
    return;
  }
  if (phase === "worse") {
    run.setConnectorOpen(false);
    scene.setConnectorOpen(false);
    setPhase("recovering");
    return;
  }
  if (phase === "done") {
    run = new LiveRun(TARGET, requestedTimeScale());
    preroll();
    scene.setConnectorOpen(false);
    ui.verdict.hidden = true;
    ui.closing.hidden = true;
    ui.before.hidden = true;
    baselineSeconds = Number.NaN;
    ui.action.textContent = "Build the road";
    anchoredLabel = "average commute";
    run.setAnchor(run.simTime);
    setPhase("before");
  }
}

function tickPhase(): void {
  const elapsed = run.simTime - phaseStartedAt;
  if (phase === "adapting") {
    const enough = run.anchoredTrips >= 40;
    if (
      elapsed >= ADAPT_MAX ||
      (elapsed >= ADAPT_MIN && enough && run.hasSettledSince(phaseStartedAt))
    ) {
      setPhase("worse");
    } else {
      describeAdapting();
    }
  } else if (phase === "recovering") {
    if (elapsed >= RECOVER_MAX || (elapsed >= RECOVER_MIN && run.hasSettledSince(phaseStartedAt))) {
      setPhase("done");
    } else {
      describeRecovering();
    }
  }
}

/**
 * Say what is happening while the network adjusts, in words that name what to
 * watch. Timed at real speed there is a stretch where the number barely moves,
 * and a visitor with no idea what to look at reads that as nothing happening.
 */
function describeAdapting(): void {
  const share = Math.round(run.shareOf("shortcut") * 100);
  const next =
    share < 6
      ? "The link is open — but nobody has tried it yet. Drivers only know the routes they have actually driven."
      : share < 22
        ? `${share}% have switched to the new link, and it is quicker for them. Watch the two bridges.`
        : `${share}% now cross both bridges instead of one. Watch what that does to the queues.`;
  if (ui.note.textContent !== next) ui.note.textContent = next;
}

function describeRecovering(): void {
  const share = Math.round(run.shareOf("shortcut") * 100);
  const next =
    share > 6
      ? `The link is shut. ${share}% of recent arrivals still came across it before it closed.`
      : "The link is shut and everyone is back on the routes they started with.";
  if (ui.note.textContent !== next) ui.note.textContent = next;
}

// ---------------------------------------------------------------------- driver

function preroll(): void {
  // Fast-forward with no rendering: a few thousand fixed steps, so the visitor
  // arrives at a settled peak hour rather than an empty map. Uses the uncapped
  // entry point — the per-frame cap is for backgrounded tabs, not for this.
  run.advanceSimulated(PREROLL);
}

let previous = 0;
function frame(now: number): void {
  const wall = previous === 0 ? 0 : (now - previous) / 1000;
  previous = now;
  run.advance(wall);
  // Exposed so a browser test can assert simulated time is actually advancing —
  // a frozen simulation and a slow one look identical from the outside.
  (window as unknown as { simulatedSeconds?: number }).simulatedSeconds = run.simTime;
  tickPhase();
  scene.render(run, network);
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
    `— ${Math.abs(control.deltaSeconds).toFixed(0)} seconds faster on average at ` +
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

    <p><strong>The before and after are the same experiment.</strong> One frozen configuration is
    run twice. Same demand, same drivers, same departure times, same random seed — each driver even
    carries the same pre-drawn number for choosing its route. The only difference permitted is
    whether the link is offered. A test compares the two configurations and fails if anything else
    differs.</p>

    <p><strong>What the numbers are.</strong> The figure on screen is a live run: the mean of the
    last ${WINDOW_TRIPS} completed trips, with simulated time running ${run.timeScale}× real time. One
    run is one sample and its average wanders by more than the effect, so the claim comes from the
    controlled experiment instead: over ${target.seeds.count} seeds the link makes the average
    commute <strong>${target.seeds.meanPercent}% worse</strong> (standard deviation
    ${target.seeds.sdPercent}%, range ${target.seeds.minPercent}% to ${target.seeds.maxPercent}%,
    and worse on every single seed). A result is only reported if the run settled and every measured
    trip finished — and only if it survives being re-run over a longer horizon, because a queue that
    is still growing looks exactly like a worse equilibrium if you stop watching at the right
    moment.</p>

    <p><strong>Two honest numbers, not one.</strong> Opening the link on a town whose drivers have
    already settled produces an adjustment period worse than the equilibrium it decays to:
    about <strong>${EXPERIMENT.transient.target.deltaPercent}%</strong> at first, easing to about
    <strong>${EXPERIMENT.transient.target.settledPercent}%</strong> once everyone has re-learned.
    That is what you watched, because waiting out the decay takes minutes of real time. We report
    both rather than the flattering one, and we checked they agree: run the experiment the other way
    round — with the link present from the very start, so nobody has habits to unlearn — and it lands
    on the same equilibrium. Both numbers are worse than before the link existed.</p>

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
  const on = (): void => scene.highlightRoute(route);
  const off = (): void => scene.highlightRoute(null);
  button.addEventListener("pointerenter", on);
  button.addEventListener("pointerleave", off);
  button.addEventListener("focus", on);
  button.addEventListener("blur", off);
}

let resizePending = false;
window.addEventListener("resize", () => {
  // Geometry only. The simulation is not told the window changed, because it has
  // no reason to care — which is what makes a resize mid-run harmless.
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
// Start the running average from the settled peak the preroll produced, so the
// baseline the visitor compares against is a real average and not one trip.
run.setAnchor(run.simTime);
setPhase("before");
requestAnimationFrame(frame);
