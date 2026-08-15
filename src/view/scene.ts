// Draws the network and the traffic on it. Reads simulation state; never writes
// any. Everything here is allowed to know about pixels; nothing here is allowed
// to decide anything the experiment depends on.

import type { LinkId, RouteId } from "../sim/network.ts";
import { buildNetwork } from "../sim/network.ts";
import type { LiveRun } from "../live.ts";
import type { StateId } from "../story.ts";
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
  if (id === "AB") return `proposed link · ${km.toFixed(1)} km`;
  const kind = id === "AT" || id === "SB" ? "long road" : "short road";
  return `${kind} · ${km.toFixed(1)} km`;
}

const LINK_ORDER: readonly LinkId[] = ["SB", "AT", "SA", "BT", "AB"];
/** Ceiling on drawn vehicles. Beyond this the picture is a jam either way. */
const VEHICLE_POOL = 320;
const VEHICLE_RADIUS = 4.6;
const SHORTCUT_VEHICLE_RADIUS = 5.8;

type NarrativeMode = StateId;
type RenderRun = Pick<LiveRun, "congestionOf" | "vehiclesOn">;

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
  private readonly traceLayer = el("g", { class: "route-traces", "aria-hidden": "true" });
  private readonly throatLayer = el("g", { class: "throats" });
  private readonly vehicleLayer = el("g", { class: "vehicles", "aria-hidden": "true" });
  private readonly nodeLayer = el("g", { class: "nodes" });
  private readonly labelLayer = el("g", { class: "road-labels" });
  private readonly annotationLayer = el("g", { class: "annotations", "aria-hidden": "true" });

  private readonly roads = new Map<LinkId, SVGPathElement>();
  private readonly labels = new Map<LinkId, SVGTextElement>();
  private shortcutNote: SVGTextElement | null = null;
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

  constructor(host: HTMLElement) {
    this.svg = el("svg", {
      class: "network",
      role: "img",
      // The structure is described once, because it never changes. The state that
      // does change is announced from the live region in the readout instead —
      // a screen reader must not have to hear about 120 moving dots.
      "aria-label":
        "Road network from Eastgate to Central. Two short roads pass through narrow bridges, " +
        "two long roads loop around them, and a central link is currently closed.",
      preserveAspectRatio: "xMidYMid meet",
    });
    this.svg.append(
      this.roadLayer,
      this.traceLayer,
      this.throatLayer,
      this.vehicleLayer,
      this.nodeLayer,
      this.labelLayer,
      this.annotationLayer,
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
    this.traceLayer.replaceChildren();
    this.throatLayer.replaceChildren();
    this.nodeLayer.replaceChildren();
    this.labelLayer.replaceChildren();
    this.annotationLayer.replaceChildren();
    for (const dot of this.dots.values()) dot.remove();
    for (const dot of this.spare) dot.remove();
    this.dots.clear();
    this.spare.length = 0;
    this.roads.clear();
    this.labels.clear();
    this.shortcutNote = null;
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

      const queueNote = el("text", {
        class: `network-note network-note--queue network-note--${id.toLowerCase()}`,
        // Put the note upstream of the bridge, where the queue actually sits.
        // A normal offset placed it directly over the Riverside/Central labels.
        x: (at.x - tangent.x * 58 + nx * 5).toFixed(1),
        y: (at.y - tangent.y * 58 + ny * 5).toFixed(1),
        "text-anchor": "middle",
      });
      queueNote.textContent = "queue forms here";
      this.annotationLayer.append(queueNote);
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
      text.append(name);
      this.labelLayer.append(text);
      this.labels.set(id, text);
    }

    const connector = this.samples.get("AB");
    if (connector !== undefined) {
      const at = alongSamples(connector, 0.5);
      this.shortcutNote = el("text", {
        class: "network-note network-note--shortcut",
        x: at.x.toFixed(1),
        y: (at.y - (kind === "wide" ? 26 : 22)).toFixed(1),
        "text-anchor": "middle",
      });
      this.annotationLayer.append(this.shortcutNote);
    }

    this.svg.append(this.vehicleLayer, this.nodeLayer, this.labelLayer, this.annotationLayer);
    this.keepLabelsInFrame();
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
   * Draw one temporary journey over the fixed road geometry. This is a purely
   * presentational cue: it never changes which links exist or how vehicles route.
   */
  traceRoute(links: readonly LinkId[]): void {
    this.traceLayer.replaceChildren();
    for (const [index, id] of links.entries()) {
      const road = this.roads.get(id);
      const d = road?.getAttribute("d");
      if (d === undefined || d === null) continue;
      const trace = el("path", {
        class: `route-trace route-trace--${id.toLowerCase()}`,
        d,
        pathLength: "1",
        "data-trace-link": id,
      });
      trace.style.setProperty("--trace-delay", `${index * 140}ms`);
      this.traceLayer.append(trace);
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

  setConnectorOpen(open: boolean): void {
    this.svg.classList.toggle("network--connector-open", open);
    this.svg.setAttribute(
      "aria-label",
      "Road network from Eastgate to Central. Two short roads pass through narrow bridges, " +
        `two long roads loop around them, and the central link is currently ${open ? "open" : "closed"}.`,
    );
  }

  /** Put the explanation on the network instead of opening another data panel. */
  setNarrative(mode: NarrativeMode, shortcutShare: number): void {
    this.svg.dataset.narrative = mode;
    if (this.shortcutNote !== null) {
      const percentage = `${Math.round(shortcutShare * 100)}%`;
      const paired = mode === "verdict" || mode === "diagnose" || mode === "reveal";
      if (mode === "wave_two") {
        this.shortcutNote.textContent = "same trip → both bridges";
      } else {
        this.shortcutNote.textContent = paired
          ? `paired cohort · ${percentage}`
          : `live choices · ${percentage}`;
      }
    }
  }

  render(run: RenderRun, network: ReturnType<typeof buildNetwork>, alpha = 1): void {
    for (const [id, path] of this.roads) {
      const ratio = run.congestionOf(id);
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
        const dot = this.dotFor(vehicle.id, vehicle.routeId);
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

  private dotFor(id: number, route: RouteId): SVGCircleElement {
    const existing = this.dots.get(id);
    const dot =
      existing ??
      this.spare.pop() ??
      el("circle", { class: "vehicle", r: String(VEHICLE_RADIUS), cx: "0", cy: "0" });

    // A route belongs to the vehicle, not the road it currently occupies. A
    // shortcut driver crosses SA, AB and BT, so styling AB alone makes that car
    // disappear again on two thirds of its journey. Refresh this metadata even
    // for an existing node: closing the connector can reroute a waiting driver,
    // and a pooled circle may next represent a driver on any route.
    const onShortcut = route === "shortcut";
    dot.classList.toggle("vehicle--shortcut", onShortcut);
    dot.setAttribute("r", String(onShortcut ? SHORTCUT_VEHICLE_RADIUS : VEHICLE_RADIUS));
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
