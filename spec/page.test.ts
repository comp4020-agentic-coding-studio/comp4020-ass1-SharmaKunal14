// Static contracts for the built page. Layout and interaction live in the browser
// suite; this file protects scope, evidence wording, accessibility and deployment.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { CONTROL, TARGET, networkOf } from "../src/experiment/config.ts";
import { EXPERIMENT } from "../src/experiment/result.generated.ts";
import { compare } from "../src/experiment/run.ts";
import { routeFreeFlowTime } from "../src/sim/network.ts";
import { STATES, STORY } from "../src/story.ts";

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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
    expect(Math.round(control.deltaPercent * 10) / 10, stale).toBe(
      EXPERIMENT.control.deltaPercent,
    );
  });

  it("demonstrates a conditional paradox, not a universal rule", () => {
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

  it("keeps the opening claim tied to empty-road geometry", () => {
    const network = networkOf(TARGET);
    const saving =
      routeFreeFlowTime(network, "north") - routeFreeFlowTime(network, "shortcut");
    expect(Math.round(saving)).toBe(31);
    expect(STORY.decide.body).toContain("31 seconds");
  });
});

describe("one idea and one mechanic", () => {
  it("uses five compact states around one road toggle", () => {
    expect(STATES).toEqual(["decide", "watch", "verdict", "recover", "reveal"]);
    expect(STORY.decide.action).toMatch(/build/i);
    expect(STORY.verdict.action).toMatch(/close/i);
    expect(STORY.watch.action).toBeNull();
    expect(STORY.recover.action).toBeNull();
  });

  it("ships one action and no dashboard controls", () => {
    expect(doc.querySelectorAll("[data-action]")).toHaveLength(1);
    expect(doc.querySelectorAll("button")).toHaveLength(1);
    expect(doc.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(doc.querySelectorAll("[data-route], .chart, progress")).toHaveLength(0);
  });

  it("asks for a decision before asking for an essay", () => {
    const headline = words(doc.querySelector("h1")?.textContent ?? "");
    const body = words(doc.querySelector("[data-body]")?.textContent ?? "");
    expect(headline).toBeLessThanOrEqual(12);
    expect(body).toBeLessThanOrEqual(20);
    expect(headline + body).toBeLessThanOrEqual(30);
  });

  it("does not name the phenomenon in the visible opening", () => {
    const opening = [
      doc.title,
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      doc.querySelector("h1")?.textContent ?? "",
      doc.querySelector("[data-body]")?.textContent ?? "",
    ].join(" ").toLowerCase();
    expect(opening).not.toContain("braess");
    expect(opening).not.toContain("paradox");
    expect(STORY.reveal.headline.toLowerCase()).toContain("braess");
    expect(doc.querySelector("[data-afterword]")?.hasAttribute("hidden")).toBe(true);
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
      "same generated drivers",
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
  it("uses a real button and one dedicated live region", () => {
    const action = doc.querySelector("[data-action]");
    expect(action?.tagName).toBe("BUTTON");
    expect(action?.getAttribute("type")).toBe("button");
    expect(doc.querySelector("[data-announce]")?.getAttribute("aria-live")).toBe("polite");
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
  const css = readFileSync(resolve("styles.css"), "utf8");

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
