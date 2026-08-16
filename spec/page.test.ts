import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;
const mainSource = readFileSync(resolve("main.ts"), "utf8");
const cssSource = readFileSync(resolve("styles.css"), "utf8");

function prose(markdown: string): string[] {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*`_]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

describe("one transparent interaction", () => {
  it("uses one slider and no sequence of buttons", () => {
    const sliders = doc.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders).toHaveLength(1);
    expect(doc.querySelectorAll("button")).toHaveLength(0);
    expect(sliders[0]).toMatchObject({ min: "0", max: "4000", step: "100", value: "0" });
  });

  it("states both rules before asking for interaction", () => {
    const copy = (doc.body.textContent ?? "").replace(/\s+/g, " ");
    expect(copy).toContain("The grey road always takes 45 minutes");
    expect(copy).toContain("The narrow road takes 1 minute per 100 cars");
    expect(copy).toContain("Every shortcut trip uses both narrow roads");
    expect(copy).toContain("nothing random is happening behind the scenes");
    expect(copy).toContain("Here is every calculation");
  });

  it("contains the complete initial arithmetic and withholds the reveal", () => {
    expect(doc.querySelector("[data-narrow-math]")?.textContent).toContain("(4,000 + 0) ÷ 2 = 2,000");
    expect(doc.querySelector("[data-old-math]")?.textContent).toContain("20 + 45 = 65 min");
    expect(doc.querySelector("[data-shortcut-math]")?.textContent).toContain("20 + 20 = 40 min");
    expect(doc.querySelector("[data-reveal]")?.hasAttribute("hidden")).toBe(true);
  });

  it("does not import the old opaque simulation into the interface", () => {
    for (const fragment of ["src/live", "src/story", "src/experiment", "Math.random", "requestAnimationFrame", "setInterval"]) {
      expect(mainSource).not.toContain(fragment);
    }
    expect(mainSource).toContain('from "./src/braess"');
  });

  it("keeps the primary copy free of the discarded process jargon", () => {
    const copy = (doc.querySelector("main")?.textContent ?? "").toLowerCase();
    for (const term of ["wave", "cohort", "seeded", "timestep", "demand", "counterfactual", "equilibrium"]) {
      expect(copy, `primary copy contains “${term}”`).not.toMatch(new RegExp(`\\b${term}\\b`));
    }
  });
});

describe("accessible and responsive presentation", () => {
  it("labels the range, live output, diagram and reveal", () => {
    const range = doc.querySelector<HTMLInputElement>("#shortcut-users");
    expect(doc.querySelector('label[for="shortcut-users"]')).not.toBeNull();
    expect(range?.getAttribute("aria-describedby")).toBe("slider-help");
    expect(doc.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(doc.querySelector("svg title")?.textContent).toContain("four-road network");
    expect(doc.querySelector("svg desc")?.textContent).toContain("narrow road");
    expect(doc.querySelector("[data-reveal]")?.getAttribute("aria-labelledby")).toBe("reveal-title");
  });

  it("has one h1, ordered headings and a reliable skip target", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelector(".skip-link")?.getAttribute("href")).toBe("#experiment");
    const levels = [...doc.querySelectorAll("h1, h2, h3")].map((node) => Number(node.tagName.slice(1)));
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("provides phone and reduced-motion rules", () => {
    expect(cssSource).toContain("@media (width < 40rem)");
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssSource).toContain(":focus-visible");
  });
});

describe("static delivery", () => {
  it("loads no third-party runtime resource", () => {
    for (const node of doc.querySelectorAll("[src], [href]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//"), `external: ${url}`).toBe(false);
    }
    expect(cssSource).not.toContain("@import url");
  });

  it("keeps relative built assets for GitHub Pages", () => {
    for (const node of doc.querySelectorAll("script[src], link[rel=stylesheet]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("/"), `absolute path: ${url}`).toBe(false);
    }
  });
});

describe("required assignment evidence", () => {
  const process = readFileSync(resolve("PROCESS.md"), "utf8");
  const reflection = readFileSync(resolve("reflections/assignment-1.md"), "utf8");

  it("keeps PROCESS.md within 400–600 words and at three or four moments", () => {
    expect(prose(process).length).toBeGreaterThanOrEqual(400);
    expect(prose(process).length).toBeLessThanOrEqual(600);
    const moments = process.match(/^\*\*\d+\. /gm) ?? [];
    expect(moments.length).toBeGreaterThanOrEqual(3);
    expect(moments.length).toBeLessThanOrEqual(4);
  });

  it("cites each process moment and keeps the reflection in range", () => {
    for (const [index, moment] of process.split(/^\*\*\d+\. /m).slice(1).entries()) {
      expect(/\[`[0-9a-f]{7,40}(\.\.\.[0-9a-f]{7,40})?`\]\(/.test(moment), `moment ${index + 1}`).toBe(true);
    }
    expect(prose(reflection).length).toBeGreaterThanOrEqual(150);
    expect(prose(reflection).length).toBeLessThanOrEqual(300);
    expect(readFileSync(resolve("CLAUDE.md"), "utf8").length).toBeGreaterThan(0);
  });
});

describe("colour contrast", () => {
  function token(name: string): string {
    const match = cssSource.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (match === null) throw new Error(`missing --${name}`);
    return match[1];
  }

  function luminance(hex: string): number {
    const linear = [1, 3, 5]
      .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrast(first: string, second: string): number {
    const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  }

  it("keeps normal text and the dark panel readable", () => {
    expect(contrast(token("ink"), token("paper"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("ink-soft"), token("paper"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("paper"), token("ink"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps meaningful accent graphics at 3:1 or better", () => {
    expect(contrast(token("teal"), token("paper"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("rust"), token("paper"))).toBeGreaterThanOrEqual(3);
  });
});
