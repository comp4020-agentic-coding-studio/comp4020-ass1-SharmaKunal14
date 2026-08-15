// Connects one deterministic traffic run to one editorial interaction. The live
// run illustrates adaptation; the quoted verdict comes from the paired headless
// experiment in result.generated.ts, never from a convenient animation frame.

import { TARGET, networkOf } from "./src/experiment/config.ts";
import { EXPERIMENT } from "./src/experiment/result.generated.ts";
import { formatDuration } from "./src/experiment/metrics.ts";
import { LiveRun, TIME_SCALE } from "./src/live.ts";
import type { LinkId } from "./src/sim/network.ts";
import { STORY, shouldAdvance } from "./src/story.ts";
import type { StateId } from "./src/story.ts";
import { currentLayout } from "./src/view/layout.ts";
import { ROAD_NAMES, Scene, describeLoad } from "./src/view/scene.ts";

const PREROLL_FILL_SECONDS = 400;
const PREROLL_SAMPLE_SECONDS = 700;
const LINKS: readonly LinkId[] = ["SA", "BT", "AT", "SB", "AB"];

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

const interpolates =
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  new URLSearchParams(window.location.search).get("nointerp") === null;

const ui = {
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

let run = new LiveRun(TARGET, requestedTimeScale());
let state: StateId = "decide";
let stateStartedAt = 0;
let previousFrame = 0;
let announcedWatchPhase = 0;
let announcementTimer = 0;

function preroll(): void {
  run.advanceSimulated(PREROLL_FILL_SECONDS);
  run.setAnchor(run.simTime);
  run.advanceSimulated(PREROLL_SAMPLE_SECONDS);
  run.setAnchor(run.simTime);
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
  scene.setConnectorOpen(run.connectorOpen);
  scene.spotlight(STORY[state].spotlight);
  scene.setNarrative(state, narrativeShare());
}

function fillEvidence(): void {
  const target = EXPERIMENT.target;
  const control = EXPERIMENT.control;
  const closed = formatDuration(target.closedSeconds);
  const open = formatDuration(target.openSeconds);
  const delta = Math.round(target.deltaSeconds);

  ui.closedValue.textContent = closed;
  ui.openValue.textContent = open;
  ui.deltaValue.textContent = `+${delta} seconds`;
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
  stateStartedAt = run.simTime;
  if (next === "watch") announcedWatchPhase = 0;
  document.body.dataset.state = next;
  (window as unknown as { storyState?: StateId }).storyState = next;

  const beat = STORY[next];
  ui.eyebrow.textContent = beat.eyebrow;
  ui.headline.textContent = beat.headline;
  ui.body.textContent = beat.body;
  ui.action.hidden = beat.action === null;
  if (beat.action !== null) ui.action.textContent = beat.action;
  ui.afterword.hidden = next !== "reveal";

  const showsComparison = next === "verdict" || next === "reveal";
  ui.comparison.hidden = !showsComparison;
  ui.liveMeasure.hidden = showsComparison;

  scene.spotlight(beat.spotlight);
  scene.setNarrative(next, narrativeShare());
  renderStateCopy();
  announce(
    next === "verdict"
      ? `${beat.headline} ${formatDuration(EXPERIMENT.target.closedSeconds)} without the road, ` +
          `${formatDuration(EXPERIMENT.target.openSeconds)} with it: ` +
          `${Math.round(EXPERIMENT.target.deltaSeconds)} seconds longer.`
      : `${beat.eyebrow}. ${beat.headline}`,
  );

  // Programmatic focus is useful after keyboard activation because the activated
  // button disappears. Pointer users keep their visual context and do not get a
  // giant focus rectangle around a non-interactive heading.
  if (focusHeading) ui.headline.focus({ preventScroll: true });
}

function renderStateCopy(): void {
  if (state === "decide") {
    ui.metric.textContent = formatDuration(EXPERIMENT.target.closedSeconds);
    ui.metricLabel.textContent = "average trip · road closed";
    ui.metricContext.textContent = "The current network has two balanced routes.";
    ui.status.textContent = "One decision. The traffic model handles the rest.";
    ui.caption.textContent = "Each dot is a simulated car. The dashed line is the proposal.";
    return;
  }

  if (state === "watch") {
    renderLiveShare("recent trips using the new road");
    renderWatchStatus();
    return;
  }

  if (state === "verdict") {
    const share = EXPERIMENT.target.sharesOpen.shortcut;
    ui.metricContext.textContent =
      "Paired runs use the same generated drivers and departures. Only the road changes.";
    ui.status.textContent =
      `${EXPERIMENT.target.routeCountsOpen.shortcut} of ${EXPERIMENT.target.cohortSize} measured ` +
      `trips chose the link (${share}%) in the paired open-road run. Every shortcut trip crossed ` +
      "both bridges.";
    ui.caption.textContent =
      "The blue shortcut stayed clear. The rust-coloured queues formed on the old roads.";
    return;
  }

  if (state === "recover") {
    renderLiveShare("recent trips that used the link");
    renderRecoveryStatus();
    return;
  }

  ui.metricContext.textContent =
    `At ${EXPERIMENT.control.demandPerHour} cars an hour, the same road saves ` +
    `${Math.round(Math.abs(EXPERIMENT.control.deltaSeconds))} seconds instead.`;
  ui.status.textContent = "The road was useful. The collective response made it harmful here.";
  ui.caption.textContent = "The original two-route pattern has returned.";
}

function narrativeShare(): number {
  if (state === "verdict" || state === "reveal") {
    return EXPERIMENT.target.sharesOpen.shortcut / 100;
  }
  return run.shareOf("shortcut");
}

function renderLiveShare(label: string): void {
  ui.metric.textContent = `${Math.round(run.shareOf("shortcut") * 100)}%`;
  ui.metricLabel.textContent = label;
  const minutes = Math.max(0, Math.round((run.simTime - stateStartedAt) / 60));
  ui.metricContext.textContent =
    `last ${run.sampleCount} completed trips · ${minutes} simulated min · illustrative run`;
}

function renderWatchStatus(): void {
  const share = Math.round(run.shareOf("shortcut") * 100);
  const bothBridgesSlowing = Math.min(run.congestionOf("SA"), run.congestionOf("BT")) >= 1.08;

  if (share < 3) {
    ui.status.textContent = "The road is open. The first drivers have not completed it yet.";
    ui.caption.textContent = "The proposed line is now a road. Watch the first cars cross it.";
  } else if (!bothBridgesSlowing) {
    ui.status.textContent = "The shortcut is drawing traffic away from both original routes.";
    ui.caption.textContent = "The shortcut looks attractive, so its share is growing.";
    if (announcedWatchPhase < 1) {
      announcedWatchPhase = 1;
      announce(`Drivers are trying the new road. ${share}% of recent completed trips used it.`);
    }
  } else {
    ui.status.textContent = "Both narrow bridge approaches are now slowing.";
    ui.caption.textContent =
      "Every shortcut trip uses both short roads. Their queues thicken; the blue link stays clear.";
    if (announcedWatchPhase < 2) {
      announcedWatchPhase = 2;
      announce("Queues are now forming at both narrow bridge approaches.");
    }
  }
}

function renderRecoveryStatus(): void {
  const share = Math.round(run.shareOf("shortcut") * 100);
  if (share >= 8) {
    ui.status.textContent = `${share}% of recent completed trips entered before the closure.`;
    ui.caption.textContent = "No new driver can choose the link. The last shortcut trips are clearing.";
  } else {
    ui.status.textContent = "New drivers are split across the original two routes again.";
    ui.caption.textContent = "Traffic is spreading back across the long roads and one bridge each.";
  }
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
    item.hidden = link === "AB" && !run.connectorOpen;
    const condition = describeLoad(run.congestionOf(link)) || "free flowing";
    item.textContent = `${ROAD_NAMES[link]}: ${condition}`;
  }
}

function onAction(event: MouseEvent): void {
  const keyboardActivation = event.detail === 0;

  if (state === "decide") {
    run.setConnectorOpen(true);
    run.setAnchor(run.simTime);
    scene.setConnectorOpen(true);
    enter("watch", keyboardActivation);
    return;
  }

  if (state === "verdict") {
    run.setConnectorOpen(false);
    run.setAnchor(run.simTime);
    scene.setConnectorOpen(false);
    enter("recover", keyboardActivation);
    return;
  }

  if (state === "reveal") {
    run = new LiveRun(TARGET, requestedTimeScale());
    preroll();
    scene.setConnectorOpen(false);
    enter("decide", keyboardActivation);
  }
}

function tickStory(): void {
  const elapsed = run.simTime - stateStartedAt;
  if (state === "watch" && shouldAdvance(state, run, elapsed)) {
    enter("verdict");
  } else if (state === "recover" && shouldAdvance(state, run, elapsed)) {
    enter("reveal");
  }
}

function frame(now: number): void {
  const wallSeconds = previousFrame === 0 ? 0 : (now - previousFrame) / 1000;
  previousFrame = now;
  run.advance(wallSeconds);

  (window as unknown as { simulatedSeconds?: number }).simulatedSeconds = run.simTime;
  tickStory();
  scene.setNarrative(state, narrativeShare());
  scene.render(run, network, interpolates ? run.stepAlpha : 1);
  renderStateCopy();
  renderLoads();
  requestAnimationFrame(frame);
}

ui.action.addEventListener("click", onAction);
window.addEventListener("resize", applyLayout);

fillEvidence();
preroll();
applyLayout();
enter("decide");
scene.render(run, network, 1);
renderLoads();
requestAnimationFrame(frame);
