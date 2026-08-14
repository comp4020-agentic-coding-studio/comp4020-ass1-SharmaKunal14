// Every random draw in this project comes from here, seeded, so a run is
// reproducible bit-for-bit. `Math.random()` is banned outside tests: an
// unseeded draw anywhere makes the experiment unrepeatable and lets "rerun
// until the paradox appears" in through the back door.
//
// mulberry32: a small, fast, well-distributed 32-bit PRNG. We need
// reproducibility, not cryptographic quality.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exponential inter-arrival time for a Poisson process of the given rate. */
export function exponential(rand: () => number, ratePerSecond: number): number {
  // 1 - u avoids log(0) when u happens to be exactly 0.
  return -Math.log(1 - rand()) / ratePerSecond;
}

/** Box–Muller normal draw, clipped to a plausible range. */
export function clippedNormal(
  rand: () => number,
  mean: number,
  sd: number,
  min: number,
  max: number,
): number {
  const u1 = Math.max(rand(), Number.EPSILON);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, mean + sd * z));
}
