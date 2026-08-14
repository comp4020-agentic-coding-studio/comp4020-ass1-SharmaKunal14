// The network: physics only. Lengths are metres, speeds metres per second.
// Nothing in here knows how anything is drawn — see src/view/layout.ts for the
// normalised geometry, which is deliberately a separate concern so that
// resizing cannot reach the simulation.

export type NodeId = "S" | "A" | "B" | "T";
export type LinkId = "SA" | "AT" | "SB" | "BT" | "AB";
export type RouteId = "north" | "south" | "shortcut";

/**
 * A narrow section inside a link: the bottleneck.
 *
 * A homogeneous link turns out to be nearly useless as a source of congestion.
 * Below capacity it runs at free flow; above capacity the queue backs up past
 * its own entrance. Either way its own traversal time barely moves — measured
 * range on an 1800 m street was 108 s to 143 s, a ratio of 1.32, which caps any
 * Braess effect at (r−1)/(r+1) ≈ 13% no matter what the demand is.
 *
 * Treiber, Hennecke & Helbing (2000) describe changes of capacity as local
 * variations of a model parameter, and report that a parameter-induced local
 * capacity drop behaves practically like an on-ramp bottleneck. So the streets
 * narrow near the junction. A queue then forms upstream of the throat *inside*
 * the street, which both widens the travel-time range enough for a real
 * equilibrium effect and gives the bottleneck a location a visitor can see.
 *
 * `taper` is the distance over which the speed drops into the throat. Without
 * it a vehicle would meet the lower desired speed instantaneously and brake at
 * a physically absurd rate; with it, the narrowing is a stretch of road.
 */
export type Bottleneck = {
  /** metres along the link where the throat begins */
  readonly start: number;
  /** metres along the link where it ends */
  readonly end: number;
  /** m/s inside the throat */
  readonly speedLimit: number;
  /**
   * seconds — the headway drivers keep crawling through the pinch. Separate
   * from the road's own headway because capacity is ~1/T: without this the
   * throat's capacity stays close to the road's however slow it is, so no queue
   * ever stands in the road and the road's travel time never becomes elastic.
   */
  readonly headway: number;
  /** metres of approach over which the limit ramps down */
  readonly taper: number;
};

export type Link = {
  readonly id: LinkId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** metres */
  readonly length: number;
  /** m/s — the posted speed of the road */
  readonly speedLimit: number;
  /**
   * seconds — the safe time headway drivers keep on this road. This is the
   * lever that sets a link's capacity, following Treiber, Hennecke & Helbing
   * (2000), who describe changes of freeway capacity as a variation of T and
   * show a parameter-induced capacity drop behaves like an on-ramp bottleneck.
   * Bigger T on the tight streets, smaller on the wide parkways — so we get
   * different capacities without simulating lanes or lane changing.
   */
  readonly headway: number;
  readonly bottleneck?: Bottleneck;
};

export type Network = {
  readonly links: Readonly<Record<LinkId, Link>>;
  readonly routes: Readonly<Record<RouteId, readonly LinkId[]>>;
};

export type Routing = {
  /** Which routes a driver may choose from right now. */
  readonly available: readonly RouteId[];
};

/**
 * The classic Braess topology. Two short low-capacity streets (SA, BT), two
 * long high-capacity parkways (AT, SB), and the proposed connector (AB).
 *
 *              A
 *          ↗   │   ↘  AT: long parkway
 *   SA: street │ AB: connector
 *  S           ▼           T
 *   SB: long parkway   ↗ BT: street
 *          ↘   B
 *
 * Without AB a commuter goes north (street then parkway) or south (parkway then
 * street). With AB they can use *both* streets and skip both parkways.
 */
export const STREET = { speedLimit: 70 / 3.6, headway: 1.6 } as const;
export const PARKWAY = { speedLimit: 110 / 3.6, headway: 1.1 } as const;
export type ThroatSpec = {
  /** m/s through the pinch */
  readonly speedLimit: number;
  /** seconds of headway through the pinch */
  readonly headway: number;
  /** metres of pinch */
  readonly length: number;
  /** metres of approach over which the limit ramps down */
  readonly taper: number;
};

/**
 * The throat only does anything if it is tighter than the road feeding it. A
 * pinch whose capacity sits above the street's own entrance capacity never
 * binds: no queue stands upstream, and the street's travel time stays pinned
 * near free flow whatever the demand. That was measured, not assumed — see
 * notes/log.md.
 */
export const DEFAULT_THROAT: ThroatSpec = Object.freeze({
  speedLimit: 16 / 3.6,
  headway: 2.8,
  length: 120,
  taper: 180,
});

/** The headway drivers keep at a given point along a link. */
export function headwayAt(link: Link, pos: number): number {
  const bn = link.bottleneck;
  if (bn === undefined) return link.headway;
  return pos >= bn.start && pos <= bn.end ? bn.headway : link.headway;
}

/** The desired speed a driver has at a given point along a link. */
export function speedLimitAt(link: Link, pos: number): number {
  const bn = link.bottleneck;
  if (bn === undefined) return link.speedLimit;
  if (pos >= bn.start && pos <= bn.end) return bn.speedLimit;
  if (pos >= bn.start - bn.taper && pos < bn.start) {
    const through = (pos - (bn.start - bn.taper)) / bn.taper;
    return link.speedLimit + through * (bn.speedLimit - link.speedLimit);
  }
  return link.speedLimit;
}

export function buildNetwork(opts: {
  streetLength: number;
  parkwayLength: number;
  connectorLength: number;
  throat?: ThroatSpec;
}): Network {
  const throatSpec = opts.throat ?? DEFAULT_THROAT;
  const link = (
    id: LinkId,
    from: NodeId,
    to: NodeId,
    length: number,
    kind: typeof STREET | typeof PARKWAY,
    throat = false,
  ): Link => ({
    id,
    from,
    to,
    length,
    speedLimit: kind.speedLimit,
    headway: kind.headway,
    ...(throat
      ? {
          bottleneck: {
            start: length - throatSpec.length - 60,
            end: length - 60,
            speedLimit: throatSpec.speedLimit,
            headway: throatSpec.headway,
            taper: throatSpec.taper,
          },
        }
      : {}),
  });

  return Object.freeze({
    links: Object.freeze({
      SA: link("SA", "S", "A", opts.streetLength, STREET, true),
      BT: link("BT", "B", "T", opts.streetLength, STREET, true),
      AT: link("AT", "A", "T", opts.parkwayLength, PARKWAY),
      SB: link("SB", "S", "B", opts.parkwayLength, PARKWAY),
      AB: link("AB", "A", "B", opts.connectorLength, STREET),
    }),
    routes: Object.freeze({
      north: Object.freeze(["SA", "AT"] as const),
      south: Object.freeze(["SB", "BT"] as const),
      shortcut: Object.freeze(["SA", "AB", "BT"] as const),
    }),
  });
}

/** Routes with the connector closed, versus open. The only difference. */
export const ROUTES_CLOSED: readonly RouteId[] = Object.freeze(["north", "south"]);
export const ROUTES_OPEN: readonly RouteId[] = Object.freeze(["north", "south", "shortcut"]);

/**
 * Free-flow traversal time of a link: no other traffic at all, but still
 * obeying the throat. Integrated numerically because the speed profile is
 * piecewise linear through the taper. This is what a driver's optimistic prior
 * for an unfamiliar road is worth, so it has to be the honest free-flow time,
 * not length/speedLimit.
 */
export function linkFreeFlowTime(link: Link, steps = 2000): number {
  if (link.bottleneck === undefined) return link.length / link.speedLimit;
  const dx = link.length / steps;
  let seconds = 0;
  for (let i = 0; i < steps; i += 1) {
    seconds += dx / speedLimitAt(link, (i + 0.5) * dx);
  }
  return seconds;
}

/** Capacity of the tightest point on a link — the throat, where there is one. */
export function linkNarrowestCapacity(
  link: Link,
  jamDistance: number,
  vehicleLength: number,
): number {
  const v = link.bottleneck?.speedLimit ?? link.speedLimit;
  const t = link.bottleneck?.headway ?? link.headway;
  return v / (v * t + jamDistance + vehicleLength);
}

export function routeFreeFlowTime(network: Network, route: RouteId): number {
  return network.routes[route].reduce(
    (total, id) => total + linkFreeFlowTime(network.links[id]),
    0,
  );
}

/**
 * Capacity in vehicles per second, from the triangular limit of the IDM
 * equilibrium flow–density relation (Treiber et al. 2000, §II E):
 * Qe(ρ) = min(v₀ρ, [1 − ρ(s₀ + l)] / T), whose maximum is
 * v₀ / (v₀T + s₀ + l).
 *
 * Used to check that demand sits below every link's capacity in *both*
 * configurations — the thing that stops the "after" case from being an
 * unbounded queue we could mistake for a worse equilibrium.
 */
export function linkCapacity(link: Link, jamDistance: number, vehicleLength: number): number {
  return link.speedLimit / (link.speedLimit * link.headway + jamDistance + vehicleLength);
}
