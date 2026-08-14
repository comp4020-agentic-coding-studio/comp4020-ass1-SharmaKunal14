// Where the network is drawn. Normalised coordinates in the unit square, so the
// only thing a resize changes is the viewBox — never a simulation value.
//
// Pure data and pure functions: no DOM, no measured element, no pixel. That is
// what lets a test assert that the same simulation state renders to the same
// normalised geometry at any size.

import type { LinkId, NodeId } from "../sim/network.ts";

export type Point = { readonly x: number; readonly y: number };

export type Segment =
  | { readonly kind: "line"; readonly a: Point; readonly b: Point }
  | {
      readonly kind: "cubic";
      readonly a: Point;
      readonly c1: Point;
      readonly c2: Point;
      readonly b: Point;
    };

/**
 * Two arrangements of the same network: landscape for desktop, portrait for a
 * phone. Both are the same graph and the same physics — only the drawing
 * differs, which is why choosing between them on resize is safe.
 *
 * Each is symmetric under a half turn about the centre, because the network is:
 * S↔T and A↔B maps the two streets onto each other and the two parkways onto
 * each other. If the picture were not symmetric the visitor would read a
 * difference between the two halves that does not exist.
 */
export type LayoutKind = "wide" | "tall";

const WIDE_NODES: Record<NodeId, Point> = {
  S: { x: 0.07, y: 0.5 },
  A: { x: 0.36, y: 0.19 },
  B: { x: 0.64, y: 0.81 },
  T: { x: 0.93, y: 0.5 },
};

const TALL_NODES: Record<NodeId, Point> = {
  S: { x: 0.5, y: 0.06 },
  A: { x: 0.19, y: 0.36 },
  B: { x: 0.81, y: 0.64 },
  T: { x: 0.5, y: 0.94 },
};

/** Control points that bow the parkways outward so they read as the long way. */
// Control points stay inside the unit square: the SVG then needs no
// `overflow: visible`, which was letting parked vehicles render outside the
// viewBox as stray dots in empty space.
const WIDE_BOW: readonly [Point, Point] = [
  { x: 0.5, y: 0.03 },
  { x: 0.95, y: 0.1 },
];
const TALL_BOW: readonly [Point, Point] = [
  { x: 0.03, y: 0.5 },
  { x: 0.1, y: 0.95 },
];

export const NODES: Record<LayoutKind, Record<NodeId, Point>> = {
  wide: WIDE_NODES,
  tall: TALL_NODES,
};

/** The viewBox each arrangement draws into. */
/**
 * Must match the aspect ratio the figure is given in CSS (16/10 wide, 5/6 tall).
 * `preserveAspectRatio="meet"` letterboxes any mismatch, which showed up as a band
 * of empty paper under the network that looked like a layout bug and was one.
 */
export const VIEWBOX: Record<LayoutKind, { readonly width: number; readonly height: number }> = {
  wide: { width: 1000, height: 625 },
  tall: { width: 600, height: 600 },
};

/**
 * The one breakpoint, shared with the stylesheet.
 *
 * It has to be shared. The arrangement used to be chosen from the measured aspect
 * of the figure while CSS sized that figure from the viewport width, so the two
 * could disagree: capping the figure's height on a phone made its box landscape,
 * the wide arrangement was selected, and the portrait network vanished on the one
 * viewport it exists for. Both sides now read this string.
 */
export const NARROW_QUERY = "(width < 62rem)";

/** A half turn about the centre of the unit square. */
function halfTurn(p: Point): Point {
  return { x: 1 - p.x, y: 1 - p.y };
}

export function segmentsFor(kind: LayoutKind): Record<LinkId, Segment> {
  const n = NODES[kind];
  const bow = kind === "wide" ? WIDE_BOW : TALL_BOW;
  return {
    SA: { kind: "line", a: n.S, b: n.A },
    BT: { kind: "line", a: n.B, b: n.T },
    AB: { kind: "line", a: n.A, b: n.B },
    AT: { kind: "cubic", a: n.A, c1: bow[0], c2: bow[1], b: n.T },
    // The southern parkway is the northern one, turned through half a turn — so
    // the two halves of the network are provably mirror images, not
    // approximately similar.
    SB: {
      kind: "cubic",
      a: halfTurn(n.T),
      c1: halfTurn(bow[1]),
      c2: halfTurn(bow[0]),
      b: halfTurn(n.A),
    },
  };
}

export function pointAt(segment: Segment, t: number): Point {
  const u = Math.min(1, Math.max(0, t));
  if (segment.kind === "line") {
    return {
      x: segment.a.x + (segment.b.x - segment.a.x) * u,
      y: segment.a.y + (segment.b.y - segment.a.y) * u,
    };
  }
  const v = 1 - u;
  const w0 = v * v * v;
  const w1 = 3 * v * v * u;
  const w2 = 3 * v * u * u;
  const w3 = u * u * u;
  return {
    x: w0 * segment.a.x + w1 * segment.c1.x + w2 * segment.c2.x + w3 * segment.b.x,
    y: w0 * segment.a.y + w1 * segment.c1.y + w2 * segment.c2.y + w3 * segment.b.y,
  };
}

/** SVG `d`, in viewBox units for the given arrangement. */
export function pathData(segment: Segment, kind: LayoutKind): string {
  const { width, height } = VIEWBOX[kind];
  const at = (p: Point): string => `${(p.x * width).toFixed(1)} ${(p.y * height).toFixed(1)}`;
  if (segment.kind === "line") return `M ${at(segment.a)} L ${at(segment.b)}`;
  return `M ${at(segment.a)} C ${at(segment.c1)} ${at(segment.c2)} ${at(segment.b)}`;
}

/**
 * Even-spaced samples along a segment, in viewBox units.
 *
 * Vehicles are positioned by looking up this table rather than by asking the
 * browser for `getPointAtLength` every frame: it keeps ~120 moving vehicles off
 * the layout path entirely, which is what makes the phone viewport hold a frame
 * rate. Sampling is arc-length corrected so a vehicle at half the link's length
 * is drawn half way along the curve, not half way through the curve's parameter.
 */
export function sampleSegment(
  segment: Segment,
  kind: LayoutKind,
  samples = 240,
): readonly Point[] {
  const { width, height } = VIEWBOX[kind];
  const raw: Point[] = [];
  const cumulative: number[] = [0];
  for (let i = 0; i <= samples; i += 1) {
    const p = pointAt(segment, i / samples);
    const scaled = { x: p.x * width, y: p.y * height };
    raw.push(scaled);
    if (i > 0) {
      const previous = raw[i - 1];
      cumulative.push(
        cumulative[i - 1] + Math.hypot(scaled.x - previous.x, scaled.y - previous.y),
      );
    }
  }

  const total = cumulative[cumulative.length - 1];
  const even: Point[] = [];
  let cursor = 0;
  for (let i = 0; i <= samples; i += 1) {
    const target = (i / samples) * total;
    while (cursor < samples && cumulative[cursor + 1] < target) cursor += 1;
    const span = cumulative[cursor + 1] - cumulative[cursor];
    const f = span === 0 ? 0 : (target - cumulative[cursor]) / span;
    even.push({
      x: raw[cursor].x + (raw[cursor + 1].x - raw[cursor].x) * f,
      y: raw[cursor].y + (raw[cursor + 1].y - raw[cursor].y) * f,
    });
  }
  return even;
}

/** Position along a sampled path, given a fraction of the link's length. */
export function alongSamples(samples: readonly Point[], fraction: number): Point {
  const clamped = Math.min(1, Math.max(0, fraction));
  const scaled = clamped * (samples.length - 1);
  const index = Math.min(samples.length - 2, Math.floor(scaled));
  const f = scaled - index;
  return {
    x: samples[index].x + (samples[index + 1].x - samples[index].x) * f,
    y: samples[index].y + (samples[index + 1].y - samples[index].y) * f,
  };
}

/**
 * Which arrangement suits the viewport. Called on resize; the simulation is not
 * told, because it has no reason to care.
 */
export function currentLayout(): LayoutKind {
  return window.matchMedia(NARROW_QUERY).matches ? "tall" : "wide";
}
