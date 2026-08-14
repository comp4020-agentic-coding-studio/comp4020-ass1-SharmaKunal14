// The network: physics only. Lengths are metres, speeds metres per second.
// Nothing in here knows how anything is drawn — see src/view/layout.ts for the
// normalised geometry, which is deliberately a separate concern so that
// resizing cannot reach the simulation.

export type NodeId = "S" | "A" | "B" | "T";
export type LinkId = "SA" | "AT" | "SB" | "BT" | "AB";
export type RouteId = "north" | "south" | "shortcut";

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
export const STREET = { speedLimit: 60 / 3.6, headway: 2.6 } as const;
export const PARKWAY = { speedLimit: 100 / 3.6, headway: 1.4 } as const;

export function buildNetwork(opts: {
  streetLength: number;
  parkwayLength: number;
  connectorLength: number;
}): Network {
  const link = (
    id: LinkId,
    from: NodeId,
    to: NodeId,
    length: number,
    kind: typeof STREET | typeof PARKWAY,
  ): Link => ({ id, from, to, length, speedLimit: kind.speedLimit, headway: kind.headway });

  return Object.freeze({
    links: Object.freeze({
      SA: link("SA", "S", "A", opts.streetLength, STREET),
      BT: link("BT", "B", "T", opts.streetLength, STREET),
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

/** Free-flow traversal time of a link, in seconds: no other traffic at all. */
export function linkFreeFlowTime(link: Link): number {
  return link.length / link.speedLimit;
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
