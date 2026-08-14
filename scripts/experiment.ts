#!/usr/bin/env node
// Runs the experiment and prints the evidence. This is the tool that decides
// whether the page is allowed to make its claim; the spec tests assert the
// invariants, this reports the numbers a human has to read.
//
//   mise exec -- node scripts/experiment.ts            target and control
//   mise exec -- node scripts/experiment.ts --seeds 8  across seeds
//   mise exec -- node scripts/experiment.ts --sweep    bounded sensitivity

import { CONTROL, TARGET, horizonOf, networkOf, worstCaseLoad } from "../src/experiment/config.ts";
import type { ExperimentConfig } from "../src/experiment/config.ts";
import { compare } from "../src/experiment/run.ts";
import type { Comparison } from "../src/experiment/run.ts";
import { meanOf, stdDevOf } from "../src/experiment/metrics.ts";
import { linkCapacity, linkFreeFlowTime, routeFreeFlowTime } from "../src/sim/network.ts";
import { IDM_TABLE_I } from "../src/sim/idm.ts";

const args = new Set(process.argv.slice(2));
const seedsFlag = process.argv.indexOf("--seeds");
const seedCount = seedsFlag > -1 ? Number(process.argv[seedsFlag + 1] ?? 5) : 0;

function describe(config: ExperimentConfig): void {
  const network = networkOf(config);
  const cap = (id: "SA" | "SB") =>
    linkCapacity(network.links[id], IDM_TABLE_I.s0, IDM_TABLE_I.vehicleLength) * 3600;
  console.log(`network  street ${linkFreeFlowTime(network.links.SA).toFixed(0)}s free-flow, `
    + `capacity ${cap("SA").toFixed(0)} veh/h · `
    + `parkway ${linkFreeFlowTime(network.links.AT).toFixed(0)}s, ${cap("SB").toFixed(0)} veh/h · `
    + `connector ${linkFreeFlowTime(network.links.AB).toFixed(0)}s`);
  console.log(`routes   north ${routeFreeFlowTime(network, "north").toFixed(0)}s · `
    + `south ${routeFreeFlowTime(network, "south").toFixed(0)}s · `
    + `shortcut ${routeFreeFlowTime(network, "shortcut").toFixed(0)}s  (all free-flow)`);
  console.log(`demand   ${config.demandPerHour} veh/h → worst-case link load `
    + `${(worstCaseLoad(config) * 100).toFixed(0)}% of capacity · horizon ${horizonOf(config)}s`);
}

function report(name: string, c: Comparison): void {
  const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const shares = (r: Comparison["open"]) =>
    `north ${(r.shares.north * 100).toFixed(0)}% south ${(r.shares.south * 100).toFixed(0)}% `
    + `shortcut ${(r.shares.shortcut * 100).toFixed(0)}%`;

  console.log(`\n── ${name} ──`);
  describe(c.closed.config);
  console.log(`closed   ${c.closed.meanTravelTime.toFixed(1)}s  n=${c.closed.cohortSize}  `
    + `${shares(c.closed)}  ${c.closed.steadyState.reason}`);
  console.log(`open     ${c.open.meanTravelTime.toFixed(1)}s  n=${c.open.cohortSize}  `
    + `${shares(c.open)}  ${c.open.steadyState.reason}`);
  console.log(`Δ        ${c.deltaSeconds >= 0 ? "+" : ""}${c.deltaSeconds.toFixed(1)}s  `
    + `${pct(c.deltaPercent)}  →  ${c.braess ? "WORSE (Braess)" : "better"}`);
  console.log(`usable   ${c.usable}  `
    + `unfinished ${c.closed.unfinished}/${c.open.unfinished}  `
    + `conservation ${c.closed.conservationViolations.length + c.open.conservationViolations.length} `
    + `violations  clamped ${c.closed.physicsClamped}/${c.open.physicsClamped}`);
  for (const v of [...c.closed.conservationViolations, ...c.open.conservationViolations].slice(0, 3)) {
    console.log(`  ! ${v}`);
  }
}

report("TARGET", compare(TARGET));
report("CONTROL", compare(CONTROL));

if (seedCount > 0) {
  console.log(`\n── across ${seedCount} seeds ──`);
  for (const base of [TARGET, CONTROL]) {
    const deltas: number[] = [];
    let usable = 0;
    for (let i = 0; i < seedCount; i += 1) {
      const c = compare({ ...base, seed: base.seed + i * 7919 });
      deltas.push(c.deltaPercent);
      if (c.usable) usable += 1;
      console.log(`  ${base.label} seed+${i}  ${c.deltaPercent >= 0 ? "+" : ""}`
        + `${c.deltaPercent.toFixed(1)}%  usable=${c.usable}`);
    }
    console.log(`  ${base.label}: mean ${meanOf(deltas).toFixed(1)}% `
      + `sd ${stdDevOf(deltas).toFixed(1)}%  usable ${usable}/${seedCount}`);
  }
}

if (args.has("--sweep")) {
  console.log(`\n── bounded sensitivity around TARGET (one knob at a time) ──`);
  const knobs: [string, (f: number) => ExperimentConfig][] = [
    ["demand", (f) => ({ ...TARGET, demandPerHour: TARGET.demandPerHour * f })],
    ["theta", (f) => ({ ...TARGET, theta: TARGET.theta * f })],
    ["alpha", (f) => ({ ...TARGET, alpha: TARGET.alpha * f })],
    ["street length", (f) => ({
      ...TARGET,
      geometry: { ...TARGET.geometry, streetLength: TARGET.geometry.streetLength * f },
    })],
    ["parkway length", (f) => ({
      ...TARGET,
      geometry: { ...TARGET.geometry, parkwayLength: TARGET.geometry.parkwayLength * f },
    })],
    ["connector length", (f) => ({
      ...TARGET,
      geometry: { ...TARGET.geometry, connectorLength: TARGET.geometry.connectorLength * f },
    })],
    ["street headway", (f) => ({
      ...TARGET,
      geometry: TARGET.geometry,
      driver: { ...TARGET.driver, TSd: TARGET.driver.TSd * f },
    })],
  ];
  for (const [name, make] of knobs) {
    const row = [0.8, 0.9, 1, 1.1, 1.2].map((f) => {
      const c = compare(make(f));
      const mark = c.usable ? "" : "?";
      return `${f.toFixed(1)}× ${c.deltaPercent >= 0 ? "+" : ""}${c.deltaPercent.toFixed(1)}%${mark}`;
    });
    console.log(`  ${name.padEnd(18)} ${row.join("   ")}`);
  }
  console.log("  (? = run not usable: unsettled or unfinished, so the number is not an equilibrium)");
}

if (args.has("--curve")) {
  // The design equation. In the open equilibrium all three routes cost the
  // same, which pins the street at t_street = t_parkway − t_connector; the
  // closed equilibrium costs t_street(D/2) + t_parkway. So
  //
  //   Braess  ⟺  (t_parkway − t_connector) > t_street(D/2)
  //   effect  =  (t_parkway − t_connector) − t_street(D/2)
  //
  // which means the whole thing turns on how steep the street's travel time is
  // between half demand and full demand. This measures that curve instead of
  // guessing at it.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  const net = networkOf(TARGET);
  const budget = linkFreeFlowTime(net.links.AT) - linkFreeFlowTime(net.links.AB);
  console.log(`\n── street travel time vs demand (t_parkway − t_connector = ${budget.toFixed(0)}s) ──`);
  console.log(`  demand  closed: SA flow  t_SA      open: SA flow  t_SA     journey closed → open`);
  for (const d of [400, 600, 800, 1000, 1200, 1400, 1600]) {
    const cfg = { ...TARGET, demandPerHour: d };
    const closed = runExperiment(cfg, { connectorOpen: false });
    const open = runExperiment(cfg, { connectorOpen: true });
    const cs = linkStats(closed.traversals, cfg, "SA");
    const os = linkStats(open.traversals, cfg, "SA");
    console.log(
      `  ${String(d).padStart(5)}   ${cs.flowPerHour.toFixed(0).padStart(9)}  `
      + `${cs.meanSeconds.toFixed(0).padStart(4)}s      `
      + `${os.flowPerHour.toFixed(0).padStart(9)}  ${os.meanSeconds.toFixed(0).padStart(4)}s     `
      + `${closed.meanTravelTime.toFixed(0)}s → ${open.meanTravelTime.toFixed(0)}s  `
      + `${open.meanTravelTime > closed.meanTravelTime ? "WORSE" : "better"}`
      + `${closed.usable && open.usable ? "" : "  (unusable)"}`,
    );
  }
}

if (args.has("--parkway")) {
  // t_parkway − t_connector is not a free parameter: in the open equilibrium it
  // *is* the street travel time the system will push towards, and therefore it
  // sets how long a queue stands on the street. Too small and the street can
  // satisfy it without queueing at all, which is why the first attempt showed
  // no effect. Too large and the queue fills the street and spills back to the
  // origin, which is oversaturation, not an equilibrium. This finds the band.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  console.log(`\n── parkway length vs the equilibrium it produces (demand 1000) ──`);
  console.log(`  parkway   budget   closed t_SA   open t_SA   journey closed → open      Δ`);
  for (const len of [5600, 6400, 7400, 8400, 9400, 10400]) {
    const cfg = { ...TARGET, geometry: { ...TARGET.geometry, parkwayLength: len } };
    const net = networkOf(cfg);
    const budget = linkFreeFlowTime(net.links.AT) - linkFreeFlowTime(net.links.AB);
    const closed = runExperiment(cfg, { connectorOpen: false });
    const open = runExperiment(cfg, { connectorOpen: true });
    const d = open.meanTravelTime - closed.meanTravelTime;
    console.log(
      `  ${String(len).padStart(6)}m  ${budget.toFixed(0).padStart(5)}s   `
      + `${linkStats(closed.traversals, cfg, "SA").meanSeconds.toFixed(0).padStart(9)}s   `
      + `${linkStats(open.traversals, cfg, "SA").meanSeconds.toFixed(0).padStart(7)}s   `
      + `${closed.meanTravelTime.toFixed(0).padStart(5)}s → ${open.meanTravelTime.toFixed(0).padStart(5)}s   `
      + `${d >= 0 ? "+" : ""}${((d / closed.meanTravelTime) * 100).toFixed(1)}%`
      + `${closed.usable && open.usable ? "" : "  (unusable)"}`,
    );
  }
}

if (args.has("--throat")) {
  // The throat's capacity relative to the street's own is the whole ballgame:
  // only a pinch tighter than the road feeding it makes a queue stand *inside*
  // the street, which is what gives the street a wide enough travel-time range
  // for a real equilibrium effect — and what puts the bottleneck somewhere a
  // visitor can point at.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  const { linkNarrowestCapacity } = await import("../src/sim/network.ts");
  console.log(`\n── throat speed vs the queue it stands up (demand 1000) ──`);
  console.log(`  throat  cap    ff     closed t_SA  open t_SA   r     journey closed → open     Δ`);
  for (const kmh of [12, 15, 18, 22, 26, 30]) {
    const cfg = {
      ...TARGET,
      geometry: { ...TARGET.geometry, throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 } },
    };
    const net = networkOf(cfg);
    const ff = linkFreeFlowTime(net.links.SA);
    const cap = linkNarrowestCapacity(net.links.SA, IDM_TABLE_I.s0, IDM_TABLE_I.vehicleLength) * 3600;
    const closed = runExperiment(cfg, { connectorOpen: false });
    const open = runExperiment(cfg, { connectorOpen: true });
    const ct = linkStats(closed.traversals, cfg, "SA").meanSeconds;
    const ot = linkStats(open.traversals, cfg, "SA").meanSeconds;
    const d = open.meanTravelTime - closed.meanTravelTime;
    console.log(
      `  ${String(kmh).padStart(4)}km/h ${cap.toFixed(0).padStart(5)}  ${ff.toFixed(0).padStart(4)}s  `
      + `${ct.toFixed(0).padStart(10)}s  ${ot.toFixed(0).padStart(8)}s  ${(ot / ff).toFixed(2)}  `
      + `${closed.meanTravelTime.toFixed(0).padStart(5)}s → ${open.meanTravelTime.toFixed(0).padStart(5)}s  `
      + `${d >= 0 ? "+" : ""}${((d / closed.meanTravelTime) * 100).toFixed(1)}%`
      + `${closed.usable && open.usable ? "" : "  (unusable)"}`,
    );
  }
}

if (args.has("--grid")) {
  // What the effect needs is a throat whose capacity sits *between* half the
  // demand and the whole of it: at D/2 the street runs free, at D it cannot,
  // so opening the connector is what stands the queue up. Neither knob alone
  // finds that — hence a grid rather than another one-at-a-time sweep.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  console.log(`\n── demand × throat: Δ journey time, "·" = not a usable equilibrium ──`);
  const demands = [200, 300, 400, 500, 600, 700, 800, 900];
  console.log(`  throat  ` + demands.map((d) => String(d).padStart(9)).join(""));
  for (const kmh of [12, 14, 16]) {
    const cells: string[] = [];
    for (const d of demands) {
      const cfg = {
        ...TARGET,
        demandPerHour: d,
        geometry: { ...TARGET.geometry, throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 } },
      };
      const closed = runExperiment(cfg, { connectorOpen: false });
      const open = runExperiment(cfg, { connectorOpen: true });
      const pct = ((open.meanTravelTime - closed.meanTravelTime) / closed.meanTravelTime) * 100;
      const ratio = linkStats(closed.traversals, cfg, "SA").meanSeconds
        / linkFreeFlowTime(networkOf(cfg).links.SA);
      // flag a baseline that is already jammed: the effect needs a free-running
      // "before", or the visitor's starting point is already the bad case
      // A busy baseline is the premise ("traffic is bad"), not a fault. What
      // disqualifies a cell is not being a settled equilibrium at all.
      const flag = !closed.usable || !open.usable ? "·" : ratio > 1.6 ? "J" : " ";
      cells.push(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%${flag}`.padStart(9));
    }
    console.log(`  ${String(kmh).padStart(4)}km/h` + cells.join(""));
  }
  console.log(`  · = not a settled equilibrium   J = baseline street beyond 1.6x free flow`);
}

if (args.has("--settle")) {
  // The grid's Braess-positive cells all failed the steady-state check. Two very
  // different things look identical there: a queue still growing (no
  // equilibrium, so no claim), and an equilibrium that simply takes longer than
  // 400s of warmup to stand its queue up. A standing queue is a slow transient,
  // so the measurement window is the first suspect. This tells them apart.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  const LONG = { warmup: 1200, window: 1500, drain: 1500 };
  for (const kmh of [10, 12]) {
    for (const d of [800, 900, 1000]) {
      const geometry = {
        ...TARGET.geometry,
        throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 },
      };
      const short = { ...TARGET, demandPerHour: d, geometry };
      const long = { ...short, ...LONG };
      const ff = linkFreeFlowTime(networkOf(long).links.SA);
      console.log(`\n  throat ${kmh}km/h, demand ${d} veh/h, street free-flow ${ff.toFixed(0)}s`);
      for (const [name, cfg] of [["short horizon", short], ["long horizon ", long]] as const) {
        const closed = runExperiment(cfg, { connectorOpen: false });
        const open = runExperiment(cfg, { connectorOpen: true });
        const pct = ((open.meanTravelTime - closed.meanTravelTime) / closed.meanTravelTime) * 100;
        console.log(
          `    ${name}  closed ${closed.meanTravelTime.toFixed(0)}s `
          + `(t_SA ${linkStats(closed.traversals, cfg, "SA").meanSeconds.toFixed(0)}s, `
          + `drift ${(closed.steadyState.drift * 100).toFixed(1)}%)  `
          + `open ${open.meanTravelTime.toFixed(0)}s `
          + `(t_SA ${linkStats(open.traversals, cfg, "SA").meanSeconds.toFixed(0)}s, `
          + `drift ${(open.steadyState.drift * 100).toFixed(1)}%, `
          + `shortcut ${(open.shares.shortcut * 100).toFixed(0)}%)  `
          + `Δ ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%  `
          + `usable ${closed.usable && open.usable}  unfin ${closed.unfinished}/${open.unfinished}`,
        );
      }
    }
  }
}

if (args.has("--pick")) {
  // Seed 0 gave +23.9% but the 8-seed spread was sd 8.8% with 2 seeds failing to
  // settle: the first candidate sat at 97% of the throat's capacity, i.e. right
  // on the edge of its own region. A configuration whose result depends on the
  // seed is not a result. This looks for one sitting *inside* the region, judged
  // on the sign holding for every seed and on all of them settling — not on the
  // biggest headline number.
  const SEEDS = 10;
  console.log(`\n── candidate robustness over ${SEEDS} seeds (sign must hold on all) ──`);
  console.log(`  throat  demand   mean      sd     min      max     settled  verdict`);
  for (const kmh of [12, 14, 16]) {
    for (const d of [700, 750, 800, 850, 900]) {
      const base = {
        ...TARGET,
        demandPerHour: d,
        geometry: { ...TARGET.geometry, throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 } },
      };
      const deltas: number[] = [];
      let settled = 0;
      for (let i = 0; i < SEEDS; i += 1) {
        const c = compare({ ...base, seed: base.seed + i * 7919 });
        deltas.push(c.deltaPercent);
        if (c.usable) settled += 1;
      }
      const min = Math.min(...deltas);
      const max = Math.max(...deltas);
      const verdict = min > 5 && settled === SEEDS ? "ROBUST" : min > 0 ? "sign ok" : "sign flips";
      console.log(
        `  ${String(kmh).padStart(4)}km/h ${String(d).padStart(5)}  `
        + `${meanOf(deltas) >= 0 ? "+" : ""}${meanOf(deltas).toFixed(1)}%  `
        + `${stdDevOf(deltas).toFixed(1)}%  `
        + `${min >= 0 ? "+" : ""}${min.toFixed(1)}%  ${max >= 0 ? "+" : ""}${max.toFixed(1)}%  `
        + `${String(settled).padStart(5)}/${SEEDS}   ${verdict}`,
      );
    }
  }
}

if (args.has("--horizon")) {
  // Nothing was ROBUST: the sign held but only ~6/10 seeds settled. Two readings
  // again — a queue that never settles, or an equilibrium slower than the window.
  // Earlier, lengthening the horizon *revealed* degradation rather than removing
  // it, which points at the second. If so the fix is the measurement, not the
  // model — and it tells us how much simulated time the page has to cover.
  const SEEDS = 10;
  console.log(`\n── does more simulated time settle it? (throat 14km/h, demand 800) ──`);
  console.log(`  warmup/window/drain   mean      sd      min      settled`);
  for (const [w, win, dr] of [[900, 1200, 1200], [1500, 1800, 1500], [2400, 2400, 1800], [3600, 3000, 2000]]) {
    const base = {
      ...TARGET,
      demandPerHour: 800,
      warmup: w,
      window: win,
      drain: dr,
      geometry: { ...TARGET.geometry, throat: { speedLimit: 14 / 3.6, headway: 2.8, length: 120, taper: 180 } },
    };
    const deltas: number[] = [];
    let settled = 0;
    for (let i = 0; i < SEEDS; i += 1) {
      const c = compare({ ...base, seed: base.seed + i * 7919 });
      deltas.push(c.deltaPercent);
      if (c.usable) settled += 1;
    }
    console.log(
      `  ${String(w).padStart(5)}/${String(win).padStart(4)}/${String(dr).padStart(4)} `
      + `(${((w + win + dr) / 60).toFixed(0)} min)   `
      + `+${meanOf(deltas).toFixed(1)}%  ${stdDevOf(deltas).toFixed(1)}%  `
      + `${Math.min(...deltas) >= 0 ? "+" : ""}${Math.min(...deltas).toFixed(1)}%   `
      + `${settled}/${SEEDS}`,
    );
  }
}

if (args.has("--invariant")) {
  const { horizonCheck } = await import("../src/experiment/run.ts");
  console.log(`\n── horizon invariance: does the answer stop depending on how long we watch? ──`);
  for (const kmh of [14, 16, 18, 22]) {
    for (const d of [400, 600, 700, 800]) {
      const cfg = {
        ...TARGET,
        demandPerHour: d,
        geometry: { ...TARGET.geometry, throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 } },
      };
      const h = horizonCheck(cfg);
      console.log(
        `  ${String(kmh).padStart(2)}km/h ${String(d).padStart(4)}veh/h  `
        + `${h.shortPercent >= 0 ? "+" : ""}${h.shortPercent.toFixed(1)}% → `
        + `${h.longPercent >= 0 ? "+" : ""}${h.longPercent.toFixed(1)}%  `
        + `${h.ok ? "OK  " : "FAIL"}  ${h.reason.slice(0, 62)}`,
      );
    }
  }
}

if (args.has("--capacity")) {
  // Every guess so far has used the *nominal* capacity from the triangular
  // fundamental diagram. The runs behave as though real discharge is far lower,
  // which would explain why demands I thought were servable were not. Measure it:
  // oversaturate the street and read the flow that actually gets through.
  const { runExperiment } = await import("../src/experiment/run.ts");
  const { linkStats } = await import("../src/experiment/metrics.ts");
  const { linkNarrowestCapacity } = await import("../src/sim/network.ts");
  console.log(`\n── measured throat discharge vs nominal capacity ──`);
  console.log(`  throat   nominal   measured   drop    servable demand (2C/1.6)`);
  for (const kmh of [14, 16, 18, 22, 30]) {
    const cfg = {
      ...TARGET,
      demandPerHour: 4000,
      geometry: { ...TARGET.geometry, throat: { speedLimit: kmh / 3.6, headway: 2.8, length: 120, taper: 180 } },
    };
    const net = networkOf(cfg);
    const nominal = linkNarrowestCapacity(net.links.SA, IDM_TABLE_I.s0, IDM_TABLE_I.vehicleLength) * 3600;
    const run = runExperiment(cfg, { connectorOpen: false });
    const measured = linkStats(run.traversals, cfg, "SA").flowPerHour;
    console.log(
      `  ${String(kmh).padStart(2)}km/h  ${nominal.toFixed(0).padStart(7)}   ${measured.toFixed(0).padStart(8)}   `
      + `${((1 - measured / nominal) * 100).toFixed(0).padStart(3)}%   ${((2 * measured) / 1.6).toFixed(0).padStart(6)} veh/h`,
    );
  }
}

if (args.has("--learning")) {
  // The open equilibrium came out lopsided (north 6% / south 34%) on a perfectly
  // symmetric network, with one street at 90% of capacity and slowly diverging.
  // A symmetric network should not have an asymmetric equilibrium, so suspect the
  // *learning*, not the physics: theta 0.04 over a 100s gap is a 55:1 preference,
  // and alpha 0.3 moves a belief a third of the way on every single trip. Sharp
  // choice plus fast learning is a recipe for overshoot that never settles.
  const { horizonCheck } = await import("../src/experiment/run.ts");
  console.log(`\n── route-learning damping (throat 16km/h, demand 800) ──`);
  console.log(`  theta  alpha   Δ short → long      symmetry (N/S)   invariant`);
  for (const theta of [0.04, 0.02, 0.01, 0.005]) {
    for (const alpha of [0.3, 0.1, 0.03]) {
      const cfg = { ...TARGET, demandPerHour: 800, theta, alpha };
      const h = horizonCheck(cfg);
      const open = compare(cfg).open;
      const asym = Math.abs(open.shares.north - open.shares.south) * 100;
      console.log(
        `  ${theta.toFixed(3)}  ${alpha.toFixed(2)}   `
        + `${h.shortPercent >= 0 ? "+" : ""}${h.shortPercent.toFixed(1)}% → `
        + `${h.longPercent >= 0 ? "+" : ""}${h.longPercent.toFixed(1)}%      `
        + `${(open.shares.north * 100).toFixed(0)}/${(open.shares.south * 100).toFixed(0)} `
        + `(gap ${asym.toFixed(0)}pt)     ${h.ok ? "OK" : "FAIL"}`,
      );
    }
  }
}

if (args.has("--budget")) {
  // The real design error, at last. `budget = t_parkway − t_connector` is the
  // street travel time the open equilibrium drives towards, so it has to sit
  // INSIDE the street's stable elastic range. I had set the parkway at 8200 m,
  // making budget 237s against a street that only stably reaches ~160s — so the
  // shortcut's 116s free-flow saving could never be overturned by congestion,
  // and the only way to "get" the effect was to run the model somewhere it had
  // not converged. Shorter parkway = a shortcut worth less = a saving that
  // congestion can actually eat.
  const { horizonCheck } = await import("../src/experiment/run.ts");
  console.log(`\n── parkway × demand with damped learning (theta 0.015, alpha 0.10) ──`);
  console.log(`  parkway  budget  ff_short  saving   demand   Δ short → long    invariant`);
  for (const len of [5200, 5800, 6400]) {
    for (const d of [500, 650, 800, 950]) {
      const cfg = {
        ...TARGET,
        theta: 0.015,
        alpha: 0.1,
        demandPerHour: d,
        geometry: { ...TARGET.geometry, parkwayLength: len },
      };
      const net = networkOf(cfg);
      const budget = linkFreeFlowTime(net.links.AT) - linkFreeFlowTime(net.links.AB);
      const saving = routeFreeFlowTime(net, "north") - routeFreeFlowTime(net, "shortcut");
      const h = horizonCheck(cfg);
      console.log(
        `  ${String(len).padStart(6)}m  ${budget.toFixed(0).padStart(5)}s  `
        + `${routeFreeFlowTime(net, "shortcut").toFixed(0).padStart(7)}s  `
        + `${saving.toFixed(0).padStart(5)}s   ${String(d).padStart(4)}    `
        + `${h.shortPercent >= 0 ? "+" : ""}${h.shortPercent.toFixed(1)}% → `
        + `${h.longPercent >= 0 ? "+" : ""}${h.longPercent.toFixed(1)}%    `
        + `${h.ok ? "OK" : "FAIL"}`,
      );
    }
  }
}

if (args.has("--hunt")) {
  const { horizonCheck } = await import("../src/experiment/run.ts");
  console.log(`\n── hunting the largest horizon-invariant effect (theta 0.015, alpha 0.10) ──`);
  const rows: { p: number; d: number; pct: number }[] = [];
  console.log(`  parkway ` + [700, 780, 860, 940].map((d) => String(d).padStart(11)).join(""));
  for (const len of [4400, 4800, 5200, 5600]) {
    const cells: string[] = [];
    for (const d of [700, 780, 860, 940]) {
      const cfg = {
        ...TARGET, theta: 0.015, alpha: 0.1, demandPerHour: d,
        geometry: { ...TARGET.geometry, parkwayLength: len },
      };
      const h = horizonCheck(cfg);
      if (h.ok && h.shortPercent > 0) rows.push({ p: len, d, pct: h.shortPercent });
      cells.push(`${h.shortPercent >= 0 ? "+" : ""}${h.shortPercent.toFixed(1)}%${h.ok ? " " : "·"}`.padStart(11));
    }
    console.log(`  ${String(len).padStart(6)}m` + cells.join(""));
  }
  rows.sort((a, b) => b.pct - a.pct);
  console.log(`  · = fails horizon invariance`);
  console.log(`\n  best horizon-invariant Braess configurations:`);
  for (const r of rows.slice(0, 5)) {
    console.log(`    parkway ${r.p}m, demand ${r.d} veh/h  →  +${r.pct.toFixed(1)}%`);
  }
  if (rows.length === 0) console.log(`    none`);
}

if (args.has("--pair")) {
  // The target and the control have to come from the SAME network, differing only
  // in demand — otherwise the control shows "some other network behaves
  // differently", which is a much weaker claim than "this network's answer
  // depends on how much traffic there is". That needs a shortcut whose free-flow
  // saving is big enough to matter when quiet and small enough for congestion to
  // overturn when busy. Both ends must be horizon-invariant.
  const { horizonCheck } = await import("../src/experiment/run.ts");
  console.log(`\n── one network, both signs, both settled? (theta 0.015, alpha 0.10) ──`);
  const demands = [300, 450, 600, 750, 860, 950];
  console.log(`  parkway saving ` + demands.map((d) => String(d).padStart(10)).join(""));
  for (const len of [5600, 6000, 6400, 6800, 7400]) {
    const net = networkOf({ ...TARGET, geometry: { ...TARGET.geometry, parkwayLength: len } });
    const saving = routeFreeFlowTime(net, "north") - routeFreeFlowTime(net, "shortcut");
    const cells: string[] = [];
    let bestNeg = 0;
    let bestPos = 0;
    for (const d of demands) {
      const h = horizonCheck({
        ...TARGET, theta: 0.015, alpha: 0.1, demandPerHour: d,
        geometry: { ...TARGET.geometry, parkwayLength: len },
      });
      if (h.ok && h.shortPercent < bestNeg) bestNeg = h.shortPercent;
      if (h.ok && h.shortPercent > bestPos) bestPos = h.shortPercent;
      cells.push(`${h.shortPercent >= 0 ? "+" : ""}${h.shortPercent.toFixed(1)}%${h.ok ? " " : "·"}`.padStart(10));
    }
    const verdict = bestNeg < -1 && bestPos > 1 ? `  ← BOTH (${bestNeg.toFixed(1)}% / +${bestPos.toFixed(1)}%)` : "";
    console.log(`  ${String(len).padStart(6)}m ${saving.toFixed(0).padStart(4)}s` + cells.join("") + verdict);
  }
  console.log(`  · = fails horizon invariance`);
}
