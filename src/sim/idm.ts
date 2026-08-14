// The Intelligent Driver Model, from the primary source:
//
//   Treiber, M., Hennecke, A., & Helbing, D. (2000). Congested traffic states in
//   empirical observations and microscopic simulations. Physical Review E,
//   62(2), 1805–1824. doi:10.1103/PhysRevE.62.1805
//
// This file is the whole of the physics. There is no latency function anywhere
// in this project: travel time is only ever measured from trajectories these
// equations produce.

export type IdmParams = {
  /** desired velocity v₀, m/s */
  readonly v0: number;
  /** safe time headway T, s */
  readonly T: number;
  /** maximum acceleration a, m/s² */
  readonly a: number;
  /** desired deceleration b, m/s² */
  readonly b: number;
  /** acceleration exponent δ */
  readonly delta: number;
  /** jam distance s₀, m */
  readonly s0: number;
};

/**
 * Table I of Treiber et al. (2000), verbatim, except v₀ which is set per link
 * from the road's posted speed. Every departure from the paper's values is
 * disclosed in the model note on the page.
 *
 * The paper's own values: v₀ 120 km/h, T 1.6 s, a 0.73 m/s², b 1.67 m/s²,
 * δ 4, s₀ 2 m, s₁ 0 m, vehicle length l 5 m.
 */
export const IDM_TABLE_I = Object.freeze({
  a: 0.73,
  b: 1.67,
  delta: 4,
  s0: 2,
  vehicleLength: 5,
  /** The paper's T; ours varies per link, which is how the paper varies capacity. */
  referenceHeadway: 1.6,
});

/**
 * Emergency deceleration ceiling. IDM is accident-free at a sane timestep, so
 * this should almost never bind; it exists so a merge conflict resolved against
 * a vehicle cannot produce a physically absurd acceleration. `physicsClamped`
 * on the engine counts how often it binds, and a check asserts it stays rare —
 * a clamp that fires constantly is a bug being hidden, not a safety net.
 */
export const MAX_DECELERATION = 9;

/**
 * Desired minimum gap s*(v, Δv) = s₀ + max(0, vT + vΔv / (2√(ab))).
 * Δv is the approach rate (own speed minus leader's).
 */
export function desiredGap(v: number, approachRate: number, p: IdmParams): number {
  const dynamic = v * p.T + (v * approachRate) / (2 * Math.sqrt(p.a * p.b));
  return p.s0 + Math.max(0, dynamic);
}

/**
 * IDM acceleration: a[1 − (v/v₀)^δ − (s_desired / s)²].
 *
 * `gap` is bumper-to-bumper distance to the leader in metres, `leaderV` its
 * speed. Pass `gap = Infinity` for a free road.
 */
export function idmAcceleration(
  v: number,
  gap: number,
  leaderV: number,
  p: IdmParams,
): number {
  const free = 1 - Math.pow(v / p.v0, p.delta);
  if (!Number.isFinite(gap)) return clamp(p.a * free);

  // A non-positive gap means something upstream is already wrong; brake hard
  // rather than dividing by zero and producing NaN that spreads silently.
  const s = Math.max(gap, 0.1);
  const sStar = desiredGap(v, v - leaderV, p);
  return clamp(p.a * (free - Math.pow(sStar / s, 2)));
}

function clamp(acc: number): number {
  return Math.max(-MAX_DECELERATION, acc);
}

/**
 * Ballistic update, which Treiber recommends over simple Euler: it does not
 * overshoot when a vehicle comes to rest, so vehicles cannot drift backwards or
 * acquire negative speed at a stop line.
 */
export function step(
  v: number,
  acc: number,
  dt: number,
): { readonly v: number; readonly advance: number } {
  const vNext = v + acc * dt;
  if (vNext >= 0) return { v: vNext, advance: 0.5 * (v + vNext) * dt };
  // Comes to a stop partway through the step: travel only the stopping distance.
  return { v: 0, advance: acc === 0 ? 0 : -(v * v) / (2 * acc) };
}
