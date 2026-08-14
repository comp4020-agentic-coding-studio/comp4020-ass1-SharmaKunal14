// The simulation. Pure: no DOM, no dimensions, no wall-clock time. Positions
// are metres from a link's start, time is seconds, and the only clock is the
// fixed timestep the caller hands in. Resizing a window cannot reach anything
// in this file, which is the point.

import { IDM_TABLE_I, idmAcceleration, MAX_DECELERATION, step } from "./idm.ts";
import type { IdmParams } from "./idm.ts";
import type { LinkId, Network, NodeId, RouteId } from "./network.ts";
import { ROUTES_CLOSED, ROUTES_OPEN } from "./network.ts";
import { chooseRoute, initialBeliefs, updateBelief } from "./routing.ts";
import type { Beliefs } from "./routing.ts";

/** One driver, generated before the run from the seed and never changed after. */
export type ScheduledDeparture = {
  readonly id: number;
  /** seconds — when this driver wants to leave */
  readonly departTime: number;
  /** multiplier on the posted speed of whatever road they are on */
  readonly v0Factor: number;
  /** multiplier on the headway that road expects */
  readonly TFactor: number;
  /** the uniform draw this driver will use to pick a route, fixed in advance */
  readonly routeDraw: number;
};

export type Vehicle = {
  readonly id: number;
  routeId: RouteId;
  links: readonly LinkId[];
  leg: number;
  /** metres from the start of the current link, at the front bumper */
  pos: number;
  vel: number;
  readonly v0Factor: number;
  readonly TFactor: number;
  readonly departTime: number;
  /** when this vehicle entered the link it is currently on */
  legEnteredAt: number;
  /** set while the vehicle is held at a node it cannot enter */
  heldAtNode: boolean;
};

/** One completed traversal of one link. The evidence for *where* the delay is. */
export type LinkTraversal = {
  readonly link: LinkId;
  readonly enteredAt: number;
  readonly exitedAt: number;
  readonly seconds: number;
};

export type Arrival = {
  readonly id: number;
  readonly routeId: RouteId;
  readonly departTime: number;
  readonly arriveTime: number;
  /** door to door, including any wait to get onto the network at all */
  readonly travelTime: number;
};

export type SimulationOptions = {
  readonly network: Network;
  readonly schedule: readonly ScheduledDeparture[];
  readonly dt: number;
  readonly theta: number;
  readonly alpha: number;
  readonly connectorOpen: boolean;
  readonly origin: NodeId;
  readonly destination: NodeId;
};

export class Simulation {
  t = 0;
  readonly arrivals: Arrival[] = [];
  readonly departureCounts: Record<RouteId, number> = { north: 0, south: 0, shortcut: 0 };
  /** every completed link traversal, so delay can be attributed to a road */
  readonly traversals: LinkTraversal[] = [];
  /** how often the emergency deceleration ceiling bound — should stay near zero */
  physicsClamped = 0;

  private readonly opts: SimulationOptions;
  private readonly byLink: Record<LinkId, Vehicle[]>;
  private readonly incoming: Partial<Record<NodeId, readonly LinkId[]>>;
  private readonly beliefs: Beliefs;
  private available: readonly RouteId[];
  private nextIndex = 0;
  /** due to leave, route chosen, still waiting for a gap to get onto the road */
  private readonly waiting: Vehicle[] = [];
  private entered = 0;

  constructor(opts: SimulationOptions) {
    this.opts = opts;
    this.beliefs = initialBeliefs(opts.network);
    this.available = opts.connectorOpen ? ROUTES_OPEN : ROUTES_CLOSED;
    this.byLink = { SA: [], AT: [], SB: [], BT: [], AB: [] };

    const incoming: Partial<Record<NodeId, LinkId[]>> = {};
    for (const link of Object.values(opts.network.links)) {
      (incoming[link.to] ??= []).push(link.id);
    }
    this.incoming = incoming;
  }

  // ---------------------------------------------------------------- state out

  /** Vehicles currently on the network, front-most first per link. */
  vehiclesOn(link: LinkId): readonly Vehicle[] {
    return this.byLink[link];
  }

  get activeCount(): number {
    let total = 0;
    for (const list of Object.values(this.byLink)) total += list.length;
    return total;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  get enteredCount(): number {
    return this.entered;
  }

  /** Departures whose scheduled time has arrived, whether or not they got on. */
  get dueCount(): number {
    return this.nextIndex;
  }

  get connectorOpen(): boolean {
    return this.available.includes("shortcut");
  }

  beliefSnapshot(): Beliefs {
    return { ...this.beliefs };
  }

  // ------------------------------------------------------------------ control

  /**
   * Open or close the connector. This is the *only* difference between the two
   * configurations, and it changes exactly one thing: which routes are on offer
   * to drivers who have not left yet.
   *
   * Closing cannot teleport anyone. Drivers already on the connector finish
   * their trip on it; drivers still on SA who had planned to use it divert to
   * the parkway, which is what a sign at the junction would make them do.
   */
  setConnectorOpen(open: boolean): void {
    if (open === this.connectorOpen) return;
    this.available = open ? ROUTES_OPEN : ROUTES_CLOSED;
    if (open) return;

    for (const vehicle of [...this.byLink.SA, ...this.waiting]) {
      if (vehicle.routeId !== "shortcut") continue;
      vehicle.routeId = "north";
      vehicle.links = this.opts.network.routes.north;
    }
  }

  // --------------------------------------------------------------------- step

  step(): void {
    const { dt } = this.opts;
    this.t += dt;
    this.releaseDueDepartures();
    this.admitWaiting();
    this.advance(dt);
    this.transfer();
  }

  private releaseDueDepartures(): void {
    const { schedule, network } = this.opts;
    while (this.nextIndex < schedule.length && schedule[this.nextIndex].departTime <= this.t) {
      const departure = schedule[this.nextIndex];
      this.nextIndex += 1;
      const routeId = chooseRoute(
        this.beliefs,
        this.available,
        departure.routeDraw,
        this.opts.theta,
      );
      this.departureCounts[routeId] += 1;
      this.waiting.push({
        id: departure.id,
        routeId,
        links: network.routes[routeId],
        leg: 0,
        pos: 0,
        vel: 0,
        v0Factor: departure.v0Factor,
        TFactor: departure.TFactor,
        departTime: departure.departTime,
        legEnteredAt: departure.departTime,
        heldAtNode: false,
      });
    }
  }

  /** First come, first served: nobody overtakes the queue to get on the road. */
  private admitWaiting(): void {
    while (this.waiting.length > 0) {
      const vehicle = this.waiting[0];
      const first = vehicle.links[0];
      const list = this.byLink[first];
      const back = list[list.length - 1];
      if (back !== undefined && back.pos < IDM_TABLE_I.s0 + IDM_TABLE_I.vehicleLength) return;

      const limit = this.opts.network.links[first].speedLimit * vehicle.v0Factor;
      vehicle.vel = back === undefined ? limit : Math.min(limit, back.vel);
      vehicle.legEnteredAt = this.t;
      this.waiting.shift();
      list.push(vehicle);
      this.entered += 1;
    }
  }

  private advance(dt: number): void {
    // Two passes: every acceleration is computed from the same state, then
    // applied. A single fused pass would let a vehicle react to a leader that
    // had already moved this tick, which makes the result depend on iteration
    // order rather than on the physics.
    const accelerations = new Map<number, number>();
    for (const list of Object.values(this.byLink)) {
      for (let i = 0; i < list.length; i += 1) {
        accelerations.set(list[i].id, this.accelerationOf(list, i));
      }
    }
    for (const list of Object.values(this.byLink)) {
      for (const vehicle of list) {
        const acc = accelerations.get(vehicle.id) ?? 0;
        if (acc <= -MAX_DECELERATION) this.physicsClamped += 1;
        const next = step(vehicle.vel, acc, dt);
        vehicle.vel = next.v;
        vehicle.pos += next.advance;
      }
    }
  }

  private accelerationOf(list: readonly Vehicle[], index: number): number {
    const vehicle = list[index];
    const link = this.opts.network.links[vehicle.links[vehicle.leg]];
    const params: IdmParams = {
      v0: link.speedLimit * vehicle.v0Factor,
      T: link.headway * vehicle.TFactor,
      a: IDM_TABLE_I.a,
      b: IDM_TABLE_I.b,
      delta: IDM_TABLE_I.delta,
      s0: IDM_TABLE_I.s0,
    };

    // A leader on the same link, if there is one ahead.
    if (index > 0) {
      const leader = list[index - 1];
      return idmAcceleration(
        vehicle.vel,
        leader.pos - vehicle.pos - IDM_TABLE_I.vehicleLength,
        leader.vel,
        params,
      );
    }

    const toNode = link.length - vehicle.pos;
    let gap = Number.POSITIVE_INFINITY;
    let leaderVel = 0;

    // Look *across* the node onto the next link of this vehicle's own route.
    // Without this every vehicle brakes at every junction, node delay scales
    // with the number of junctions, and the connector — which adds one — looks
    // harmful for reasons that have nothing to do with Braess.
    const nextId = vehicle.links[vehicle.leg + 1];
    if (nextId !== undefined) {
      const next = this.byLink[nextId];
      const tail = next[next.length - 1];
      if (tail !== undefined) {
        gap = toNode + tail.pos - IDM_TABLE_I.vehicleLength;
        leaderVel = tail.vel;
      }
    }

    // Gap acceptance where two streams merge: yield to whoever reaches the
    // junction first. Without this, two vehicles can arrive together and one
    // gets stopped dead at the line.
    if (nextId !== undefined && link.to !== this.opts.destination) {
      for (const otherId of this.incoming[link.to] ?? []) {
        if (otherId === link.id) continue;
        const other = this.byLink[otherId][0];
        if (other === undefined) continue;
        const otherToNode = this.opts.network.links[otherId].length - other.pos;
        if (otherToNode >= toNode) continue;
        const mergeGap = toNode - otherToNode - IDM_TABLE_I.vehicleLength;
        if (mergeGap < gap) {
          gap = mergeGap;
          leaderVel = other.vel;
        }
      }
    }

    return idmAcceleration(vehicle.vel, gap, leaderVel, params);
  }

  private recordTraversal(vehicle: Vehicle, link: LinkId): void {
    this.traversals.push({
      link,
      enteredAt: vehicle.legEnteredAt,
      exitedAt: this.t,
      seconds: this.t - vehicle.legEnteredAt,
    });
  }

  private transfer(): void {
    const denied = new Set<number>();
    // Two passes is enough: at this timestep no vehicle advances far enough to
    // clear two links, so the only reason to look again is that a transfer
    // freed space for the vehicle behind it.
    for (let pass = 0; pass < 2; pass += 1) {
      const candidates: { link: LinkId; vehicle: Vehicle; overshoot: number }[] = [];
      for (const id of Object.keys(this.byLink) as LinkId[]) {
        const front = this.byLink[id][0];
        if (front === undefined || denied.has(front.id)) continue;
        const overshoot = front.pos - this.opts.network.links[id].length;
        if (overshoot >= 0) candidates.push({ link: id, vehicle: front, overshoot });
      }
      if (candidates.length === 0) return;

      // Whoever reached the junction first goes first. Deterministic: the id
      // tiebreak means the outcome never depends on object iteration order.
      candidates.sort((x, y) => y.overshoot - x.overshoot || x.vehicle.id - y.vehicle.id);

      for (const { link, vehicle, overshoot } of candidates) {
        const nextId = vehicle.links[vehicle.leg + 1];
        if (nextId === undefined) {
          this.byLink[link].shift();
          this.recordTraversal(vehicle, link);
          this.arrivals.push({
            id: vehicle.id,
            routeId: vehicle.routeId,
            departTime: vehicle.departTime,
            arriveTime: this.t,
            travelTime: this.t - vehicle.departTime,
          });
          updateBelief(
            this.beliefs,
            vehicle.routeId,
            this.t - vehicle.departTime,
            this.opts.alpha,
          );
          continue;
        }

        const next = this.byLink[nextId];
        const tail = next[next.length - 1];
        const room =
          tail === undefined || tail.pos - overshoot >= IDM_TABLE_I.s0 + IDM_TABLE_I.vehicleLength;
        if (!room) {
          // Hold at the line. The vehicle stays on this link, so everyone
          // behind it queues behind a stopped leader, which is what a queue is.
          vehicle.pos = this.opts.network.links[link].length;
          vehicle.vel = 0;
          vehicle.heldAtNode = true;
          denied.add(vehicle.id);
          continue;
        }

        this.byLink[link].shift();
        this.recordTraversal(vehicle, link);
        vehicle.pos = overshoot;
        vehicle.leg += 1;
        vehicle.legEnteredAt = this.t;
        vehicle.heldAtNode = false;
        next.push(vehicle);
      }
    }
  }
}
