// Draws the network and the traffic on it. Reads simulation state; never writes
// any. Everything here is allowed to know about pixels; nothing here is allowed
// to decide anything the experiment depends on.

import type { LinkId, RouteId } from "../sim/network.ts";
import { buildNetwork } from "../sim/network.ts";
import type { LiveRun } from "../live.ts";
import type { LayoutKind, Point } from "./layout.ts";
import { NODES, VIEWBOX, alongSamples, pathData, sampleSegment, segmentsFor } from "./layout.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

export const NODE_NAMES: Record<string, string> = {
  S: "Eastgate",
  A: "Riverside",
  B: "Millbrook",
  T: "Central",
};

export const ROAD_NAMES: Record<LinkId, string> = {
  SA: "Riverside Rd",
  BT: "Millbrook Rd",
  AT: "North Ring",
  SB: "South Ring",
  AB: "the new link",
};

/**
 * The drawing cannot show that one road is three times the length of another and
 * still fit a phone, so the label says it. Without this the network reads as a
 * single oval and nothing distinguishes the short roads from the long way round.
 */
function labelFor(id: LinkId, network: ReturnType<typeof buildNetwork>): string {
  const km = network.links[id].length / 1000;
  return `${ROAD_NAMES[id]} · ${km.toFixed(1)} km`;
}

const LINK_ORDER: readonly LinkId[] = ["SB", "AT", "SA", "BT", "AB"];
const ROUTE_LINKS: Record<RouteId, readonly LinkId[]> = {
  north: ["SA", "AT"],
  south: ["SB", "BT"],
  shortcut: ["SA", "AB", "BT"],
};

/** Ceiling on drawn vehicles. Beyond this the picture is a jam either way. */
const VEHICLE_POOL = 320;


function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export class Scene {
  private readonly svg: SVGSVGElement;
  private readonly roadLayer = el("g", { class: "roads" });
  private readonly throatLayer = el("g", { class: "throats" });
  private readonly hitLayer = el("g", { class: "road-hits" });
  private readonly vehicleLayer = el("g", { class: "vehicles", "aria-hidden": "true" });
  private readonly nodeLayer = el("g", { class: "nodes" });
  private readonly labelLayer = el("g", { class: "road-labels" });

  private readonly roads = new Map<LinkId, SVGPathElement>();
  private readonly labels = new Map<LinkId, SVGTextElement>();
  private readonly stateLabels = new Map<LinkId, SVGTSpanElement>();
  private readonly hitAreas = new Map<LinkId, SVGPathElement>();
  private samples = new Map<LinkId, readonly Point[]>();
  /**
   * One circle per vehicle, keyed by its id rather than by draw order.
   *
   * Pooling by draw order meant a given circle represented a different car from one
   * frame to the next as vehicles entered and left, so its shade jumped for no
   * reason and nothing on screen had a stable identity. Keyed by id, each car keeps
   * its own node for its whole trip.
   */
  private readonly dots = new Map<number, SVGCircleElement>();
  private readonly spare: SVGCircleElement[] = [];
  private layout: LayoutKind | null = null;
  private roadStateShown = false;

  constructor(host: HTMLElement) {
    this.svg = el("svg", {
      class: "network",
      role: "img",
      // The structure is described once, because it never changes. The state that
      // does change is announced from the live region in the readout instead —
      // a screen reader must not have to hear about 120 moving dots.
      "aria-label":
        "Road network. Two short roads through narrow bridges, Riverside Rd and Millbrook Rd, " +
        "and two long ring roads, North Ring and South Ring, connecting Eastgate to Central. " +
        "A proposed new link would join Riverside to Millbrook across the middle.",
      preserveAspectRatio: "xMidYMid meet",
    });
    this.svg.append(
      this.roadLayer,
      this.throatLayer,
      this.vehicleLayer,
      this.nodeLayer,
      this.labelLayer,
      this.hitLayer,
    );
    host.append(this.svg);
  }

  /**
   * Rebuild the drawing for a viewport shape. Called on resize, including
   * mid-interaction: it replaces geometry only, so the simulation carries on
   * untouched and no state is lost.
   */
  setLayout(
    kind: LayoutKind,
    geometry: { streetLength: number; throatStart: number },
    network: ReturnType<typeof buildNetwork>,
  ): void {
    if (this.layout === kind) return;
    this.layout = kind;

    const box = VIEWBOX[kind];
    this.svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    this.svg.dataset.layout = kind;

    const segments = segmentsFor(kind);
    this.roadLayer.replaceChildren();
    this.throatLayer.replaceChildren();
    this.hitLayer.replaceChildren();
    this.nodeLayer.replaceChildren();
    this.labelLayer.replaceChildren();
    for (const dot of this.dots.values()) dot.remove();
    for (const dot of this.spare) dot.remove();
    this.dots.clear();
    this.spare.length = 0;
    this.roads.clear();
    this.labels.clear();
    this.stateLabels.clear();
    this.hitAreas.clear();
    this.samples = new Map();

    for (const id of LINK_ORDER) {
      const segment = segments[id];
      const path = el("path", {
        class: `road road--${id.toLowerCase()}${id === "AB" ? " road--connector" : ""}`,
        d: pathData(segment, kind),
        "data-link": id,
      });
      this.roadLayer.append(path);
      this.roads.set(id, path);
      this.samples.set(id, sampleSegment(segment, kind));

      // A generous invisible stroke over each road: a 5px line is not a touch
      // target, and pointing at a road is how a visitor explores the picture.
      // Keyboard parity comes from the route legend, which lights the same roads
      // and carries the same numbers.
      const hit = el("path", {
        class: "road-hit",
        d: pathData(segment, kind),
        "data-link": id,
      });
      hit.addEventListener("pointerenter", () => this.emphasise(id));
      hit.addEventListener("pointerleave", () => this.emphasise(null));
      this.hitLayer.append(hit);
      this.hitAreas.set(id, hit);
    }

    // The pinch, drawn where it actually is. The queue that stands behind it is
    // not drawn at all — it is the vehicles bunching, which is the honest way to
    // show it.
    for (const id of ["SA", "BT"] as const) {
      const points = this.samples.get(id);
      if (!points) continue;
      const fraction = geometry.throatStart / geometry.streetLength;
      const at = alongSamples(points, fraction);
      const tangent = tangentAt(points, fraction);
      const nx = -tangent.y;
      const ny = tangent.x;
      const marker = el("g", { class: "throat" });
      // Two ticks squeezing in across the carriageway: a narrowing, not a dot.
      for (const side of [1, -1]) {
        marker.append(
          el("line", {
            class: "throat__tick",
            x1: (at.x + nx * side * 13).toFixed(1),
            y1: (at.y + ny * side * 13).toFixed(1),
            x2: (at.x + nx * side * 5).toFixed(1),
            y2: (at.y + ny * side * 5).toFixed(1),
          }),
        );
      }
      const tag = el("text", {
        class: "throat__label",
        x: (at.x + nx * 20).toFixed(1),
        y: (at.y + ny * 20).toFixed(1),
        "text-anchor": "middle",
        dy: "4",
      });
      tag.textContent = "bridge";
      marker.append(tag);
      this.throatLayer.append(marker);
    }

    for (const [id, point] of Object.entries(NODES[kind])) {
      const cx = point.x * box.width;
      const cy = point.y * box.height;
      const group = el("g", { class: `node node--${id.toLowerCase()}` });
      group.append(el("circle", { cx: String(cx), cy: String(cy), r: "7", class: "node__dot" }));
      const label = el("text", {
        x: String(cx),
        y: String(cy),
        class: "node__label",
        "text-anchor": labelAnchor(kind, id),
        dy: labelOffset(kind, id),
      });
      label.textContent = NODE_NAMES[id] ?? id;
      group.append(label);
      this.nodeLayer.append(group);
    }

    for (const id of LINK_ORDER) {
      const points = this.samples.get(id);
      if (!points) continue;
      const fraction = id === "AB" ? 0.62 : 0.5;
      const at = alongSamples(points, fraction);
      // Push the label clear of the road it names, along the road's own normal,
      // on whichever side faces away from the middle of the picture. Placing it
      // on the path made every label sit across its own line.
      const tangent = tangentAt(points, fraction);
      let nx = -tangent.y;
      let ny = tangent.x;
      const outX = at.x - box.width / 2;
      const outY = at.y - box.height / 2;
      if (nx * outX + ny * outY < 0) {
        nx = -nx;
        ny = -ny;
      }
      const offset = kind === "wide" ? 20 : 24;
      // Keep the label inside the viewBox and turn its anchor to suit. Pushed
      // outward unclamped, the ring labels ran off the edge of a phone and were
      // drawn as "lorth Ring" and "5.6 kr".
      const labelX = at.x + nx * offset;
      const text = el("text", {
        x: labelX.toFixed(1),
        y: (at.y + ny * offset).toFixed(1),
        class: `road-label road-label--${id.toLowerCase()}`,
        "text-anchor": "middle",
      });
      const name = el("tspan", { class: "road-label__name", x: labelX.toFixed(1), dy: "0" });
      name.textContent = labelFor(id, network);
      // A second line for how the road is running right now. The state belongs at
      // the road, not in a status list beside the picture — that list was the
      // dashboard this project is supposed not to be.
      const state = el("tspan", {
        class: "road-label__state",
        x: labelX.toFixed(1),
        dy: "15",
      });
      text.append(name, state);
      this.labelLayer.append(text);
      this.labels.set(id, text);
      this.stateLabels.set(id, state);
    }

    this.svg.append(this.vehicleLayer, this.nodeLayer, this.labelLayer, this.hitLayer);
    this.keepLabelsInFrame();
  }

  /** Lift one road out of the picture on hover, or clear it. */
  private emphasise(link: LinkId | null): void {
    this.svg.classList.toggle("network--emphasising", link !== null);
    for (const [id, path] of this.roads) {
      path.classList.toggle("road--emphasis", id === link);
    }
  }

  /**
   * Spotlight the roads a story beat is about — the link when it opens, the two
   * bridges when they start to queue. The narrative points at the picture instead
   * of describing it.
   */
  spotlight(links: readonly LinkId[]): void {
    const lit = new Set(links);
    this.svg.classList.toggle("network--spotlight", lit.size > 0);
    for (const [id, path] of this.roads) {
      path.classList.toggle("road--spot", lit.has(id));
    }
    for (const [id, label] of this.labels) {
      label.classList.toggle("road-label--spot", lit.has(id));
    }
  }

  /**
   * Pull any label that overhangs the viewBox back inside and turn its anchor to
   * suit.
   *
   * Clamping the anchor point is not enough: a centred label spreads half its width
   * either side, so the ring-road labels ran off the edge of a phone and rendered as
   * "lorth Ring" and "5.6 kr". This needs the measured box, so it runs once per
   * layout change — never per frame.
   */
  private keepLabelsInFrame(): void {
    const box = this.svg.viewBox.baseVal;
    const margin = 4;
    for (const label of this.labels.values()) {
      let bounds: DOMRect;
      try {
        bounds = label.getBBox();
      } catch {
        return; // not laid out yet (jsdom, or a detached tree)
      }
      if (bounds.width === 0) continue;
      let x: number | null = null;
      let anchor: string | null = null;
      if (bounds.x < margin) {
        x = margin;
        anchor = "start";
      } else if (bounds.x + bounds.width > box.width - margin) {
        x = box.width - margin;
        anchor = "end";
      }
      if (x === null || anchor === null) continue;
      label.setAttribute("text-anchor", anchor);
      label.setAttribute("x", x.toFixed(1));
      for (const child of label.children) child.setAttribute("x", x.toFixed(1));
    }
  }

  /**
   * Whether roads report how they are running, annotated at the road.
   *
   * Off by default. Five roads each carrying a live status line is the dashboard
   * this project is not; the state earns its place only once the explanation needs
   * it, at which point it appears exactly where the thing it describes is.
   */
  showRoadState(on: boolean): void {
    this.roadStateShown = on;
    if (on) return;
    for (const label of this.stateLabels.values()) label.textContent = "";
  }

  setConnectorOpen(open: boolean): void {
    this.svg.classList.toggle("network--connector-open", open);
  }

  /** Inspection, not a mechanic: show which roads a route actually uses. */
  highlightRoute(route: RouteId | null): void {
    const lit = route === null ? null : new Set(ROUTE_LINKS[route]);
    this.svg.classList.toggle("network--highlighting", lit !== null);
    for (const [id, path] of this.roads) {
      path.classList.toggle("road--lit", lit !== null && lit.has(id));
    }
  }

  render(run: LiveRun, network: ReturnType<typeof buildNetwork>, alpha = 1): void {
    for (const [id, path] of this.roads) {
      const ratio = run.congestionOf(id);
      const state = this.stateLabels.get(id);
      if (state !== undefined) {
        const words = this.roadStateShown ? describeLoad(ratio) : "";
        if (state.textContent !== words) state.textContent = words;
      }
      // Width carries load as well as colour, so the state does not depend on
      // being able to tell two hues apart.
      path.style.setProperty("--load", ratio.toFixed(3));
      path.classList.toggle("road--slow", ratio > 1.25);
      path.classList.toggle("road--crawling", ratio > 1.8);
    }

    const seen = new Set<number>();
    let drawn = 0;
    for (const id of LINK_ORDER) {
      const points = this.samples.get(id);
      if (!points) continue;
      const length = network.links[id].length;
      const limit = network.links[id].speedLimit;
      for (const vehicle of run.vehiclesOn(id)) {
        if (drawn >= VEHICLE_POOL) break;
        // Interpolate within the step, except across a junction: a vehicle that
        // changed link this step has a previous position on a different road, and
        // blending the two would slide it across open ground.
        const at = alongSamples(
          points,
          (vehicle.prevLeg === vehicle.leg
            ? vehicle.prevPos + (vehicle.pos - vehicle.prevPos) * alpha
            : vehicle.pos) / length,
        );
        const dot = this.dotFor(vehicle.id);
        seen.add(vehicle.id);
        dot.setAttribute("cx", at.x.toFixed(1));
        dot.setAttribute("cy", at.y.toFixed(1));
        // Slower vehicles are drawn darker; the bunching is what shows the queue.
        dot.style.setProperty("--speed", (vehicle.vel / limit).toFixed(2));
        drawn += 1;
      }
    }
    // Retire the cars that finished this frame. Hidden and reused, not removed:
    // an off-canvas coordinate still renders as a stray dot beside the network.
    for (const [id, dot] of this.dots) {
      if (seen.has(id)) continue;
      dot.style.display = "none";
      this.dots.delete(id);
      this.spare.push(dot);
    }
  }

  private dotFor(id: number): SVGCircleElement {
    const existing = this.dots.get(id);
    if (existing !== undefined) return existing;
    const dot =
      this.spare.pop() ?? el("circle", { class: "vehicle", r: "4.6", cx: "0", cy: "0" });
    dot.style.display = "";
    if (dot.parentNode === null) this.vehicleLayer.append(dot);
    this.dots.set(id, dot);
    return dot;
  }
}

/** Unit tangent at a fraction along a sampled path. */
function tangentAt(samples: readonly Point[], fraction: number): Point {
  const i = Math.min(samples.length - 2, Math.max(0, Math.floor(fraction * (samples.length - 1))));
  const dx = samples[i + 1].x - samples[i].x;
  const dy = samples[i + 1].y - samples[i].y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Words for how a road is running. Never colour alone. */
export function describeLoad(ratio: number): string {
  if (ratio < 1.08) return "";
  if (ratio < 1.25) return "slowing";
  if (ratio < 1.8) return `${ratio.toFixed(1)}× slower`;
  return `queueing · ${ratio.toFixed(1)}× slower`;
}

function labelAnchor(kind: LayoutKind, node: string): string {
  if (kind === "tall") return node === "A" ? "start" : node === "B" ? "end" : "middle";
  return node === "S" ? "start" : node === "T" ? "end" : "middle";
}

function labelOffset(kind: LayoutKind, node: string): string {
  if (kind === "tall") return node === "S" ? "-16" : node === "T" ? "26" : "-14";
  return node === "A" ? "-16" : node === "B" ? "26" : "-16";
}
