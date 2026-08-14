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
