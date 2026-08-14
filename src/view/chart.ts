// The one chart. It exists because the sentence "it got better first, then
// worse" is otherwise only in the copy: the effect is a few per cent, so a live
// average wanders across it, and a level shift against a noise band is the honest
// way to show a small change. Not a dashboard — one series, two markers.

import type { LiveRun, Marker, Sample } from "../live.ts";
import { formatDuration } from "../experiment/metrics.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 280;
const HEIGHT = 86;
const PAD = { top: 8, right: 4, bottom: 12, left: 4 };

export class Chart {
  private readonly svg: SVGSVGElement;
  private readonly line: SVGPolylineElement;
  private readonly markerLayer: SVGGElement;
  private readonly baseline: SVGLineElement;
  private readonly caption: HTMLElement;

  constructor(host: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    this.svg.setAttribute("class", "chart");
    this.svg.setAttribute("preserveAspectRatio", "none");
    // The series is decoration for a screen reader: every number in it is already
    // available as text, and the caption below states the trend in words.
    this.svg.setAttribute("aria-hidden", "true");

    this.baseline = document.createElementNS(SVG_NS, "line");
    this.baseline.setAttribute("class", "chart__baseline");
    this.markerLayer = document.createElementNS(SVG_NS, "g");
    this.line = document.createElementNS(SVG_NS, "polyline");
    this.line.setAttribute("class", "chart__line");
    this.svg.append(this.baseline, this.markerLayer, this.line);

    this.caption = document.createElement("p");
    this.caption.className = "chart__caption";
    host.append(this.svg, this.caption);
  }

  render(run: LiveRun, baselineSeconds: number): void {
    const samples = run.samples;
    if (samples.length < 3) {
      this.caption.textContent = "";
      return;
    }

    const times = samples.map((s) => s.mean);
    let low = Math.min(...times);
    let high = Math.max(...times);
    if (Number.isFinite(baselineSeconds)) {
      low = Math.min(low, baselineSeconds);
      high = Math.max(high, baselineSeconds);
    }
    // Never let a flat series fill the whole box: a 2-second wobble drawn full
    // height reads as a collapse.
    const span = Math.max(high - low, 25);
    const mid = (low + high) / 2;
    low = mid - span / 2;
    high = mid + span / 2;

    const firstT = samples[0].simTime;
    const lastT = samples[samples.length - 1].simTime;
    const spanT = Math.max(lastT - firstT, 1);
    const x = (t: number): number =>
      PAD.left + ((t - firstT) / spanT) * (WIDTH - PAD.left - PAD.right);
    const y = (v: number): number =>
      PAD.top + (1 - (v - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);

    this.line.setAttribute(
      "points",
      samples.map((s: Sample) => `${x(s.simTime).toFixed(1)},${y(s.mean).toFixed(1)}`).join(" "),
    );

    if (Number.isFinite(baselineSeconds)) {
      const yb = y(baselineSeconds).toFixed(1);
      this.baseline.setAttribute("x1", String(PAD.left));
      this.baseline.setAttribute("x2", String(WIDTH - PAD.right));
      this.baseline.setAttribute("y1", yb);
      this.baseline.setAttribute("y2", yb);
      this.baseline.style.display = "";
    } else {
      this.baseline.style.display = "none";
    }

    this.markerLayer.replaceChildren();
    for (const marker of run.markers as readonly Marker[]) {
      if (marker.simTime < firstT) continue;
      const at = x(marker.simTime);
      const rule = document.createElementNS(SVG_NS, "line");
      rule.setAttribute("class", `chart__marker chart__marker--${marker.kind}`);
      rule.setAttribute("x1", at.toFixed(1));
      rule.setAttribute("x2", at.toFixed(1));
      rule.setAttribute("y1", String(PAD.top - 4));
      rule.setAttribute("y2", String(HEIGHT - PAD.bottom));
      const tag = document.createElementNS(SVG_NS, "text");
      tag.setAttribute("class", "chart__marker-label");
      tag.setAttribute("x", at.toFixed(1));
      tag.setAttribute("y", String(HEIGHT - 2));
      tag.setAttribute("text-anchor", at > WIDTH / 2 ? "end" : "start");
      tag.textContent = marker.kind === "opened" ? "built" : "closed";
      this.markerLayer.append(rule, tag);
    }

    this.caption.textContent = this.describe(samples, baselineSeconds);
  }

  /** The trend in words, because the drawing is hidden from screen readers. */
  private describe(samples: readonly Sample[], baselineSeconds: number): string {
    const now = samples[samples.length - 1].mean;
    if (!Number.isFinite(baselineSeconds)) {
      return `Average commute over the last ${Math.round(
        (samples[samples.length - 1].simTime - samples[0].simTime) / 60,
      )} simulated minutes, holding around ${formatDuration(now)}.`;
    }
    const delta = Math.round(now - baselineSeconds);
    if (delta > 3) {
      return `Now ${formatDuration(now)} — ${delta} seconds above the ${formatDuration(
        baselineSeconds,
      )} it ran at before. Part of that is drivers still re-learning; it settles lower than this, ` +
        `but not back down.`;
    }
    if (delta < -3) {
      return `Now ${formatDuration(now)} — ${Math.abs(delta)} seconds below the ${formatDuration(
        baselineSeconds,
      )} it ran at before.`;
    }
    return `Now ${formatDuration(now)}, level with the ${formatDuration(
      baselineSeconds,
    )} it ran at before.`;
  }
}
