// Static contracts for the built page. Layout and interaction live in the browser
// suite; this file protects scope, evidence wording, accessibility and deployment.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { CONTROL, TARGET, networkOf } from "../src/experiment/config.ts";
import { EXPERIMENT } from "../src/experiment/result.generated.ts";
import { formatDuration } from "../src/experiment/metrics.ts";
import { compare } from "../src/experiment/run.ts";
import { routeFreeFlowTime } from "../src/sim/network.ts";
import { STATES, STORY } from "../src/story.ts";

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;
const mainSource = readFileSync(resolve("main.ts"), "utf8");
const sceneSource = readFileSync(resolve("src/view/scene.ts"), "utf8");
const cssSource = readFileSync(resolve("styles.css"), "utf8");

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function primaryMainCopy(source: string): string {
  const sourceFile = ts.createSourceFile(
    "main.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fragments: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && /\s/.test(node.text)) {
      fragments.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      fragments.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return fragments.join(" ");
}

describe("the page quotes controlled evidence", () => {
  const stale = "generated result is stale — run `node scripts/snapshot.ts`";

  it("matches fresh chosen-seed target and control runs", () => {
    const target = compare(TARGET);
    const control = compare(CONTROL);
    expect(Math.round(target.closed.meanTravelTime * 10) / 10, stale).toBe(
      EXPERIMENT.target.closedSeconds,
    );
    expect(Math.round(target.open.meanTravelTime * 10) / 10, stale).toBe(
      EXPERIMENT.target.openSeconds,
    );
    expect(Math.round(control.closed.meanTravelTime * 10) / 10, stale).toBe(
      EXPERIMENT.control.closedSeconds,
    );
    expect(Math.round(control.open.meanTravelTime * 10) / 10, stale).toBe(
      EXPERIMENT.control.openSeconds,
    );
  });

  it("demonstrates a conditional paradox, not a universal rule", () => {
    expect(EXPERIMENT.target).toMatchObject({
      demandPerHour: 860,
      closedSeconds: 331.3,
      openSeconds: 343.8,
      deltaSeconds: 12.5,
      deltaPercent: 3.8,
      cohortSize: 280,
    });
    expect(EXPERIMENT.control).toMatchObject({
      demandPerHour: 300,
      closedSeconds: 318.6,
      openSeconds: 310.7,
      deltaSeconds: -7.9,
      deltaPercent: -2.5,
      cohortSize: 96,
      routeCountsOpen: { north: 29, south: 26, shortcut: 41 },
      sharesOpen: { north: 30, south: 27, shortcut: 43 },
    });
    expect(EXPERIMENT.target.deltaSeconds).toBeGreaterThan(0);
    expect(EXPERIMENT.control.deltaSeconds).toBeLessThan(0);
    expect(EXPERIMENT.target.horizonInvariant).toBe(true);
    expect(EXPERIMENT.target.seeds.usable).toBe(8);
    expect(EXPERIMENT.target.seeds.excluded).toBe(2);
    expect(EXPERIMENT.target.seeds.signHeld).toBe(true);
  });

  it("ties the 38% shortcut claim to a measured open-road cohort", () => {
    expect(EXPERIMENT.target.sharesOpen.shortcut).toBe(38);
    expect(EXPERIMENT.target.routeCountsOpen.shortcut).toBe(106);
    expect(EXPERIMENT.target.cohortSize).toBe(280);
    expect(Object.values(EXPERIMENT.target.routeCountsOpen).reduce((sum, n) => sum + n, 0)).toBe(
      EXPERIMENT.target.cohortSize,
    );
    expect(EXPERIMENT.target.sharesOpen.north + EXPERIMENT.target.sharesOpen.south +
      EXPERIMENT.target.sharesOpen.shortcut).toBe(100);
  });

  it("derives the two bridge-load explanations from the measured route counts", () => {
    const closed = EXPERIMENT.target.routeCountsClosed;
    const open = EXPERIMENT.target.routeCountsOpen;

    expect(closed.north).toBe(131);
    expect(open.north + open.shortcut).toBe(198);
    expect(closed.south).toBe(149);
    expect(open.south + open.shortcut).toBe(188);
    expect(open.shortcut).toBe(106);
  });

  it("keeps the route lesson tied to empty-road geometry", () => {
    const network = networkOf(TARGET);
    const north = routeFreeFlowTime(network, "north");
    const south = routeFreeFlowTime(network, "south");
    const shortcut = routeFreeFlowTime(network, "shortcut");
    const saving = north - shortcut;

    expect(north).toBeCloseTo(south, 8);
    expect(Math.round(north)).toBe(305);
    expect(Math.round(shortcut)).toBe(274);
    expect(Math.round(saving)).toBe(31);
    expect(STORY.map.headline).toMatch(/find two equally quick ways/i);
    expect(STORY.map.body).toMatch(/road lengths and speed limits/i);
    expect(mainSource).toContain(
      'ui.metricContext.textContent = "305 − 274 = 31 seconds. These are estimates, not timed trips."',
    );
    expect((doc.querySelector(".model-note")?.textContent ?? "").toLowerCase()).toContain(
      "the first 5:05 and 4:34 numbers are map estimates",
    );
  });

  it("serves the authoritative peak comparison before JavaScript runs", () => {
    expect(doc.querySelector("[data-closed-value]")?.textContent?.trim()).toBe(
      formatDuration(EXPERIMENT.target.closedSeconds),
    );
    expect(doc.querySelector("[data-open-value]")?.textContent?.trim()).toBe(
      formatDuration(EXPERIMENT.target.openSeconds),
    );
    expect(doc.querySelector("[data-delta-value]")?.textContent?.trim()).toBe("+13 seconds");
  });
});

describe("one investigation carried through six chapters", () => {
  it("uses seventeen ordered, user-paced states", () => {
    expect(STATES).toEqual([
      "map",
      "proposal",
      "quiet",
      "quiet_closed",
      "quiet_open",
      "quiet_result",
      "peak",
      "wave_one",
      "wave_two",
      "wave_three",
      "wave_four",
      "compare",
      "verdict",
      "diagnose",
      "recovery",
      "synthesis",
      "reveal",
    ]);
    expect(STATES.map((state) => STORY[state].chapter)).toEqual([
      1, 2, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6,
    ]);
    expect(new Set(STATES.map((state) => STORY[state].chapter))).toEqual(
      new Set([1, 2, 3, 4, 5, 6]),
    );

    for (const state of STATES) {
      expect(STORY[state].headline.trim(), `${state} headline`).not.toBe("");
      expect(STORY[state].body.trim(), `${state} body`).not.toBe("");
      expect(STORY[state].action.trim(), `${state} action`).not.toBe("");
    }
    expect(mainSource).not.toContain("shouldAdvance");
  });

  it("provides a six-step chapter rail with a single current step", () => {
    const rail = doc.querySelector("nav.chapters");
    const items = [...doc.querySelectorAll<HTMLElement>("[data-chapter]")];

    expect(rail?.getAttribute("aria-label")).toBe("Story progress");
    expect(rail?.querySelector("ol")).not.toBeNull();
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.dataset.chapter)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "Meet the roads",
      "Add a shortcut",
      "Try a quiet morning",
      "Make it busy",
      "Watch cars choose",
      "Explain the surprise",
    ]);
    expect(items.filter((item) => item.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(items[0].getAttribute("aria-current")).toBe("step");
    expect(doc.querySelector("[data-chapter-number]")?.textContent?.trim()).toBe("1");
  });

  it("gates progression on chapter choices instead of automatic story timers", () => {
    const action = doc.querySelector<HTMLButtonElement>("[data-action]");
    const choices = doc.querySelector("[data-choices]");

    expect(doc.body.dataset.state).toBe("map");
    expect(action?.disabled).toBe(true);
    expect(action?.textContent?.trim()).toBe(STORY.map.action);
    expect(choices).not.toBeNull();
    expect(mainSource).toContain('input.type = "radio"');
    expect(mainSource).toContain('button.setAttribute("aria-pressed"');
  });

  it("makes the proposal a route trace rather than two mandatory endpoint cards", () => {
    expect(STORY.proposal.eyebrow).toMatch(/add a shortcut/i);
    expect(STORY.proposal.headline).toMatch(/draw a quicker-looking way/i);
    expect(STORY.proposal.body).toMatch(/Riverside to Millbrook/i);
    expect(STORY.proposal.action).toBe("Draw it with the keyboard");

    expect(mainSource).toContain("let shortcutTraced = false");
    expect(mainSource).toContain('state === "proposal" && !shortcutTraced');
    expect(mainSource).toContain("scene.traceRoute(currentTrace())");
    expect(sceneSource).toContain('onShortcutDraw?: () => void');
    expect(sceneSource).toContain('data-draw-node');
    expect(sceneSource).toContain('finishShortcutGesture');
    expect(mainSource).not.toContain("endpointsSelected");
    expect(mainSource).not.toMatch(/choiceButton\(\s*["']A["']/);
    expect(mainSource).not.toMatch(/choiceButton\(\s*["']B["']/);
  });

  it("draws the selected journey and distinguishes shortcut cars without colour alone", () => {
    expect(sceneSource).toContain('class: "route-traces"');
    expect(sceneSource).toContain("traceRoute(links: readonly LinkId[])");
    expect(sceneSource).toContain('"data-trace-link": id');
    expect(cssSource).toMatch(/\.route-trace\s*\{/);
    expect(cssSource).toContain("@keyframes route-draw");

    expect(sceneSource).toContain('const onShortcut = route === "shortcut"');
    expect(sceneSource).toContain('dot.classList.toggle("vehicle--shortcut", onShortcut)');
    expect(sceneSource).toContain("SHORTCUT_VEHICLE_RADIUS");
    expect(sceneSource).toContain(
      'dot.setAttribute("r", String(onShortcut ? SHORTCUT_VEHICLE_RADIUS : VEHICLE_RADIUS))',
    );

    const shortcutVehicleRule = cssSource.match(/\.vehicle--shortcut\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(shortcutVehicleRule).toContain("fill: var(--shortcut-car)");
    expect(shortcutVehicleRule).toContain("stroke: var(--ink)");
  });

  it("uses different discovery interactions instead of a chain of continue buttons", () => {
    expect(mainSource).toContain("completeShortcutDraw");
    expect(mainSource).toContain("followShortcutVehicle");
    expect(mainSource).toContain("inspectBridgeFromMap");
    expect(mainSource).toContain("fairTestBuilder");
    expect(mainSource).toContain("renderVerdictStep");
    expect(mainSource).toContain("causalBuilder");
    expect(sceneSource).toContain('this.interaction !== "draw"');
    expect(sceneSource).toContain('this.interaction !== "follow"');
    expect(sceneSource).toContain('this.interaction === "queues"');
    expect(doc.querySelectorAll("[data-discovery]")).toHaveLength(3);
  });

  it("asks for observations before stating the busy-morning explanation", () => {
    expect(STORY.wave_one.headline).toMatch(/pick one gold car/i);
    expect(STORY.wave_three.headline).toMatch(/where are the two queues/i);
    expect(STORY.wave_four.headline).toMatch(/what will happen/i);
    expect(STORY.compare.headline).toMatch(/build a test/i);
    expect(STORY.diagnose.headline).toMatch(/why did/i);
    expect(STORY.synthesis.headline).toMatch(/causal order/i);
  });

  it("keeps the interaction surface bounded and dashboard-free", () => {
    expect(doc.querySelectorAll("[data-action]")).toHaveLength(1);
    expect(doc.querySelectorAll("button")).toHaveLength(1);
    expect(doc.querySelectorAll("input[type=range], select, textarea")).toHaveLength(0);
    expect(doc.querySelectorAll(".dashboard, .chart, canvas, progress, [role=slider]")).toHaveLength(0);
    expect(mainSource).not.toMatch(/\.type\s*=\s*["']range["']/);
  });

  it("keeps every chapter beat concise enough to remain an interactive story", () => {
    for (const state of STATES) {
      const beat = STORY[state];
      expect(words(beat.headline), `${state} headline`).toBeLessThanOrEqual(12);
      expect(words(beat.body), `${state} body`).toBeLessThanOrEqual(28);
      expect(words(beat.action), `${state} action`).toBeLessThanOrEqual(7);
    }
  });

  it("uses the second wave to explain topology instead of repeating route share", () => {
    expect(STORY.wave_two.headline).toBe("What did that gold car use?");
    expect(STORY.wave_two.body).toMatch(/begins on Riverside Road/i);
    expect(STORY.wave_two.body).toMatch(/finishes on Millbrook Road/i);
    expect(STORY.wave_two.action).toBe("Keep watching the morning");
    expect(mainSource).toContain('ui.metric.textContent = "1 car → 2 bridges"');
    expect(mainSource).toContain('ui.metricLabel.textContent = "your followed route"');
  });

  it("keeps the main story child-friendly while the evidence disclosure stays technical", () => {
    const storyCopy = Object.values(STORY)
      .flatMap((beat) => [beat.eyebrow, beat.headline, beat.body, beat.action])
      .join(" ");
    const visibleCopy = `${storyCopy} ${primaryMainCopy(mainSource)}`;

    for (const term of [
      "wave",
      "demand",
      "paired",
      "cohort",
      "counterfactual",
      "seeded",
      "fixed-step",
    ]) {
      expect(visibleCopy, `primary copy contains unexplained “${term}”`).not.toMatch(
        new RegExp(`\\b${term}\\b`, "i"),
      );
    }
  });

  it("shows where the key percentages and bridge totals come from", () => {
    expect(mainSource).toContain(
      "${EXPERIMENT.control.routeCountsOpen.shortcut} ÷ ` +",
    );
    expect(mainSource).toContain(
      "`${EXPERIMENT.target.routeCountsOpen.shortcut} ÷ ${EXPERIMENT.target.cohortSize} ≈ `",
    );
    expect(mainSource).toContain(
      "`${oldWay} + ${target.routeCountsOpen.shortcut} = ${counts.open}`",
    );

    const control = EXPERIMENT.control;
    const target = EXPERIMENT.target;
    expect(
      `${control.routeCountsOpen.shortcut} ÷ ${control.cohortSize} ≈ ${control.sharesOpen.shortcut}%`,
    ).toBe("41 ÷ 96 ≈ 43%");
    expect(
      `${target.routeCountsOpen.shortcut} ÷ ${target.cohortSize} ≈ ${target.sharesOpen.shortcut}%`,
    ).toBe("106 ÷ 280 ≈ 38%");
    expect(
      `${target.routeCountsOpen.north} + ${target.routeCountsOpen.shortcut} = ${target.routeCountsOpen.north + target.routeCountsOpen.shortcut}`,
    ).toBe("92 + 106 = 198");
    expect(
      `${target.routeCountsOpen.south} + ${target.routeCountsOpen.shortcut} = ${target.routeCountsOpen.south + target.routeCountsOpen.shortcut}`,
    ).toBe("82 + 106 = 188");
  });

  it("labels saved evidence as something shown, not a live test being run", () => {
    expect(STORY.quiet.action).toBe("Set up the quiet-road test");
    expect(STORY.quiet_closed.body).toMatch(/not running the simulation now/i);
    expect(STORY.quiet_closed.action).toMatch(/^Show\b/);
    expect(STORY.quiet_open.action).toMatch(/^Reuse\b/);
    expect(STORY.compare.action).toBe("Use this test");
    expect(STORY.verdict.action).toMatch(/^Reveal\b/);
    expect(STORY.quiet_closed.action).not.toMatch(/^Run\b/);
    expect(STORY.compare.action).not.toMatch(/^Run\b/);
  });

  it("reveals the quiet-road calculation before its conclusion", () => {
    const control = EXPERIMENT.control;
    expect(control.closedTotalSeconds).toBe(30_586);
    expect(control.openTotalSeconds).toBe(29_826);
    expect(STORY.quiet_open.headline).toContain("5:19");
    expect(STORY.quiet_open.body).toContain("30,586");
    expect(mainSource).toContain('state === "quiet_closed"');
    expect(mainSource).toContain('state === "quiet_open"');
    expect(mainSource).toContain('`${EXPERIMENT.control.closedTotalSeconds.toLocaleString("en-AU")} ÷ `');
    expect(mainSource).toContain('`Open: ${EXPERIMENT.control.openTotalSeconds.toLocaleString("en-AU")} ÷ `');
  });

  it("withholds the phenomenon until the final reveal", () => {
    const opening = [
      doc.title,
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      doc.querySelector("h1")?.textContent ?? "",
      doc.querySelector("[data-body]")?.textContent ?? "",
    ].join(" ").toLowerCase();
    expect(opening).not.toContain("braess");
    expect(opening).not.toContain("paradox");
    for (const state of STATES.slice(0, -1)) {
      const copy = `${STORY[state].eyebrow} ${STORY[state].headline} ${STORY[state].body}`.toLowerCase();
      expect(copy, `${state} reveals the name early`).not.toContain("braess");
      expect(copy, `${state} reveals the name early`).not.toContain("paradox");
    }
    expect(STORY.reveal.headline.toLowerCase()).toContain("braess");
    expect(doc.querySelector("[data-afterword]")?.hasAttribute("hidden")).toBe(true);
  });

  it("uses the two evidence-backed demand scenarios and no invented third case", () => {
    expect(STORY.quiet.body).toContain(String(EXPERIMENT.control.demandPerHour));
    expect(STORY.verdict.body).toContain(String(EXPERIMENT.target.demandPerHour));
    expect(mainSource).toContain('ui.metric.textContent = "860"');
    expect(mainSource).toContain("`${Math.abs(EXPERIMENT.control.deltaSeconds)} seconds saved, rounded to 8. `");
    expect(STORY.compare.body).toMatch(/only whether the shortcut is open should change/i);
  });
});

describe("the disclosure matches the implementation", () => {
  const note = (doc.querySelector(".model-note")?.textContent ?? "").replace(/\s+/g, " ");
  const lower = note.toLowerCase();

  it("labels the simulation and the route-choice mechanism honestly", () => {
    for (const phrase of [
      "synthetic network",
      "intelligent driver model",
      "fixed 0.25-second timestep",
      "shared learning",
      "one running estimate",
      "seeded, probabilistic choice",
    ]) {
      expect(lower, `model note no longer contains “${phrase}”`).toContain(phrase);
    }
  });

  it("separates the animated illustration from the paired verdict", () => {
    for (const phrase of [
      "paired counterfactual",
      "same generated departure schedule",
      "only treatment difference",
      "warm-start illustration",
      "not used as the scientific result",
    ]) {
      expect(lower, `evidence note no longer contains “${phrase}”`).toContain(phrase);
    }
  });

  it("does not claim every individual trip became slower", () => {
    const servedCopy = (doc.body.textContent ?? "").toLowerCase();
    expect(servedCopy).not.toContain("everyone’s commute got worse");
    expect(servedCopy).not.toContain("every driver got");
  });
});

describe("static GitHub Pages delivery", () => {
  it("loads no third-party resource from the markup", () => {
    for (const node of doc.querySelectorAll("[src], [href]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("http://") || url.startsWith("//"), `external: ${url}`).toBe(false);
      if (url.startsWith("https://")) expect(node.tagName).toBe("A");
    }
  });

  it("uses relative asset paths under a repository sub-path", () => {
    for (const node of doc.querySelectorAll("script[src], link[rel=stylesheet]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("/"), `absolute path: ${url}`).toBe(false);
    }
  });
});

describe("accessible markup", () => {
  it("uses a labelled choice group, a real action button, and one dedicated live region", () => {
    const choices = doc.querySelector("[data-choices]");
    const action = doc.querySelector<HTMLButtonElement>("[data-action]");

    expect(choices?.getAttribute("role")).toBe("group");
    expect(choices?.getAttribute("aria-label")).toBe("Chapter choices");
    expect(action?.tagName).toBe("BUTTON");
    expect(action?.getAttribute("type")).toBe("button");
    expect(action?.textContent?.trim()).not.toBe("");
    expect(doc.querySelector("[data-announce]")?.getAttribute("aria-live")).toBe("polite");
    expect(doc.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("gives the generated choice controls semantic names and state", () => {
    for (const fragment of [
      'button.type = "button"',
      'button.setAttribute("aria-pressed"',
      'document.createElement("fieldset")',
      'document.createElement("legend")',
      'input.type = "radio"',
    ]) {
      expect(mainSource, `missing generated-control contract: ${fragment}`).toContain(fragment);
    }
  });

  it("provides a reliable skip target", () => {
    expect(doc.querySelector(".skip-link")?.getAttribute("href")).toBe("#experience");
    expect(doc.querySelector("#experience")?.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps heading levels ordered beneath one h1", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    const levels = [...doc.querySelectorAll("h1, h2, h3")].map((heading) =>
      Number(heading.tagName.slice(1)),
    );
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1]).toBeLessThanOrEqual(1);
    }
  });
});

describe("required process evidence", () => {
  function prose(markdown: string): string[] {
    return markdown
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#*`_]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  }

  const process = readFileSync(resolve("PROCESS.md"), "utf8");
  const reflection = readFileSync(resolve("reflections/assignment-1.md"), "utf8");

  it("keeps PROCESS.md within 400–600 words and three or four moments", () => {
    expect(prose(process).length).toBeGreaterThanOrEqual(400);
    expect(prose(process).length).toBeLessThanOrEqual(600);
    const moments = process.match(/^\*\*\d+\. /gm) ?? [];
    expect(moments.length).toBeGreaterThanOrEqual(3);
    expect(moments.length).toBeLessThanOrEqual(4);
  });

  it("cites every process moment with a commit link", () => {
    for (const [index, moment] of process.split(/^\*\*\d+\. /m).slice(1).entries()) {
      expect(
        /\[`[0-9a-f]{7,40}(\.\.\.[0-9a-f]{7,40})?`\]\(/.test(moment),
        `moment ${index + 1} has no commit citation`,
      ).toBe(true);
    }
  });

  it("keeps the assignment reflection within 150–300 words", () => {
    expect(prose(reflection).length).toBeGreaterThanOrEqual(150);
    expect(prose(reflection).length).toBeLessThanOrEqual(300);
  });
});

describe("colour contrast", () => {
  const css = cssSource;

  function tokens(): Record<string, string> {
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}\n", css.indexOf(":root {")));
    return Object.fromEntries(
      [...root.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [
        match[1],
        match[2],
      ]),
    );
  }

  function luminance(hex: string): number {
    const linear = [1, 3, 5]
      .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrast(first: string, second: string): number {
    const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  }

  const palette = tokens();

  it("keeps normal text at 4.5:1 or better", () => {
    for (const token of ["ink", "ink-soft", "ink-faint"]) {
      expect(contrast(palette[token], palette.paper), `--${token}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps meaningful graphics and focus at 3:1 or better", () => {
    for (const token of ["road", "road-slow", "road-crawl", "connector", "focus"]) {
      expect(contrast(palette[token], palette.paper), `--${token}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the primary action label readable", () => {
    expect(contrast(palette.paper, palette.ink)).toBeGreaterThanOrEqual(4.5);
  });
});
