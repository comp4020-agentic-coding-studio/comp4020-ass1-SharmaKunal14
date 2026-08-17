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

describe("transparent direct interactions", () => {
  it("uses direct controls rather than a sequence of continue buttons", () => {
    const sliders = doc.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders).toHaveLength(1);
    expect(doc.querySelectorAll<HTMLInputElement>('input[name="personal-route"]')).toHaveLength(0);
    expect(doc.querySelectorAll<HTMLInputElement>('input[name="prediction"]')).toHaveLength(0);
    expect(doc.querySelector(".prediction")).toBeNull();
    expect(doc.querySelector("[data-prediction-feedback]")).toBeNull();
    expect(doc.querySelectorAll("button")).toHaveLength(14);
    expect(doc.querySelector("[data-reset-simulation]")?.hasAttribute("disabled")).toBe(true);
    expect(doc.querySelector("[data-reset-simulation]")?.getAttribute("aria-label")).toBe("Reset experiment");
    expect(doc.querySelector("[data-reset-simulation]")?.textContent).toContain("Reset");
    expect(doc.querySelector(".intro__actions > [data-reset-simulation]")).not.toBeNull();
    expect(doc.querySelector("[data-play]")).toBeNull();
    expect(doc.querySelector("[data-show-result]")).not.toBeNull();
    expect(doc.querySelector("[data-toggle-road]")).not.toBeNull();
    expect(doc.querySelector("[data-reopen-shortcut]")?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector("[data-reopen-shortcut]")?.textContent).toContain("Open the shortcut again");
    expect(sliders[0]).toMatchObject({ min: "0", max: "4000", step: "100", value: "0" });
  });

  it("keeps the controls, map and arithmetic in one experiment", () => {
    const explore = doc.querySelector(".explore-card");
    const experiment = doc.querySelector(".experiment");
    expect(explore).not.toBeNull();
    expect(explore?.querySelector("#shortcut-users")).not.toBeNull();
    expect(explore?.querySelector("[data-town-comparison]")).toBeNull();
    expect(explore?.querySelector(".route-ledger")).toBeNull();
    expect(explore?.querySelector(".live-math")).toBeNull();
    expect(experiment?.querySelector(".calculator")).not.toBeNull();
    expect(experiment?.querySelector("[data-network-wrap]")).not.toBeNull();
    expect(experiment?.querySelector(":scope > .live-math")).not.toBeNull();
    expect(experiment?.querySelector(".live-math [data-town-comparison]")).not.toBeNull();
    expect(experiment?.querySelector(".live-math .route-ledger")).not.toBeNull();
    expect(doc.querySelectorAll("[data-average-time]")).toHaveLength(1);
    expect(doc.querySelector(".times")).toBeNull();
    expect(doc.querySelector("details")).toBeNull();
    expect(doc.querySelector(".personal-choice")).toBeNull();
  });

  it("states all three rules before asking for interaction", () => {
    const copy = (doc.body.textContent ?? "").replace(/\s+/g, " ");
    const rules = [...doc.querySelectorAll(".rules article")].map((rule) => rule.textContent?.replace(/\s+/g, " "));
    expect(rules).toEqual([
      "1Grey roadAlways takes 45 minutes",
      "2Narrow roadTakes 1 minute per 100 drivers",
      "3Middle connectorTakes 0 minutes in this simplified model",
    ]);
    const setup = [...doc.querySelectorAll(".setup-summary article")].map((item) =>
      item.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(setup).toEqual([
      "Fixed 4,000 drivers Same start and destination. Nobody is added or removed.",
      "You control Shortcut use One slider moves drivers from the two old routes onto the shortcut.",
      "Your goal Lowest town average Watch every route time recalculate as the crowd moves.",
    ]);
    expect(doc.querySelector(".intro__setup")?.getAttribute("aria-labelledby")).toBe("setup-title");
    expect(doc.querySelector(".setup-summary")?.getAttribute("aria-label")).toBe("Experiment setup");
    expect(copy).toContain("4,000 unique drivers = 80 dots throughout");
    expect(copy).toContain("Road labels count who passes there, so do not add those overlapping road loads");
    expect(copy).toContain("These three groups add to 4,000");
    expect(copy).toContain("Road loads overlap: every shortcut driver passes through both narrow roads");
    expect(doc.querySelector(".route-ledger")?.getAttribute("aria-label")).toBe("Inspect where all 80 dots are now");
    expect(doc.querySelectorAll(".route-ledger [data-spotlight]")).toHaveLength(3);
    expect(doc.querySelectorAll(".calculation-equations [data-spotlight]")).toHaveLength(5);
    expect(doc.querySelector("[data-calculation-copy]")?.getAttribute("aria-live")).toBe("polite");
    expect(doc.querySelectorAll('.calculation-equations [data-spotlight][aria-describedby="calculation-help"]')).toHaveLength(5);
    expect(doc.querySelectorAll(".calculation-equations [data-calculation-explanation]")).toHaveLength(5);
    expect(cssSource).toContain(".route-ledger__route:focus-visible,\n.live-math button:focus-visible");
    expect(doc.querySelectorAll('[data-spotlight][aria-pressed="false"]')).toHaveLength(8);
    expect(copy).toContain("make the town as fast as possible");
    expect(copy).toContain("1Best pointFind it");
    expect(copy).toContain("2Break-evenLocked");
    expect(copy).toContain("3The paradoxLocked");
    expect(copy).toContain("Can 100 drivers rescue the town");
    expect(copy).toContain("Move exactly 100 drivers back");
    expect(copy).toContain("Moving back helps the town, but it hurts the drivers who move");
    expect(copy).toContain("Before the shortcut 65 min");
    expect(copy).toContain("Where the current times come from");
    expect(copy).toContain("Only the shortcut changed");
    expect(copy).toContain("Every driver followed the route that looked quicker");
    expect(copy).toContain("Together, they made both narrow roads busier");
    expect(copy).toContain("The pattern has a name Braess’s paradox");
    expect(copy).toContain("Reveal the paradox");
    expect(doc.querySelector(".endpoint-prompt__proof")?.textContent?.replace(/\s+/g, " ")).toContain("Driver count4,000 → 4,000");
    expect(doc.querySelector(".endpoint-prompt__proof")?.textContent?.replace(/\s+/g, " ")).toContain("Town average65 → 80 min");
    expect(copy).toContain("Nobody saves time by leaving alone");
    expect(doc.querySelector(".open-insight__choice")?.textContent?.replace(/\s+/g, " ")).toContain("Stay on shortcut80 min < Leave alone85 min");
    expect(copy).toContain("Prove it backwards");
    expect(copy).toContain("Drivers locked 4,000 Shortcut Open");
    expect(copy).toContain("Shortcut closed · same experiment 80 → 65 min");
    expect(copy).toContain("One road removed. The same 4,000 drivers are now 15 minutes faster");
    expect(copy).toContain("Return to the explanation");
    expect(doc.querySelector(".experiment > [data-reveal]")).toBeNull();
    expect(doc.querySelector("main > [data-reveal]")).not.toBeNull();
    expect(doc.querySelector("[data-reveal] > [data-road-control]")).not.toBeNull();
    expect(doc.querySelector("[data-map-proof]")?.closest("[data-network-wrap]")).not.toBeNull();
    expect(doc.querySelector("[data-toggle-road]")?.getAttribute("role")).toBe("switch");
    expect(doc.querySelector("[data-toggle-road]")?.getAttribute("aria-checked")).toBe("true");
    expect(doc.querySelector("[data-slider-action]")?.getAttribute("data-next-action")).toBe("false");
    expect(doc.querySelector("[data-rescue-invitation]")).toBeNull();
    expect(doc.querySelector("[data-network-switch]")).toBeNull();
    expect(doc.querySelector("[data-map-proof]")?.getAttribute("data-result-highlight")).toBe("false");
    expect(doc.querySelector("[data-rescue-result]")?.getAttribute("data-result-highlight")).toBe("false");
    expect(doc.querySelector("[data-town-comparison]")?.getAttribute("data-result-highlight")).toBe("false");
    expect(doc.querySelector("[data-town-comparison]")?.getAttribute("tabindex")).toBe("-1");
    expect(doc.querySelector("[data-return-explanation]")).not.toBeNull();
    expect(doc.querySelector("[data-closure-result]")).toBeNull();
    expect(doc.querySelector("[data-play], [data-animate]")).toBeNull();
    expect(doc.querySelector(".slider-block > [data-endpoint-prompt]")).not.toBeNull();
    expect(doc.querySelector(".slider-block > [data-open-insight]")?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector(".live-math ~ [data-endpoint-prompt]")).toBeNull();
  });

  it("contains the complete initial arithmetic and withholds the reveal", () => {
    expect(doc.querySelector("[data-narrow-math]")?.textContent).toContain(
      "0 + (4,000 ÷ 2) = 2,000 drivers passing",
    );
    expect(doc.querySelector("[data-old-math]")?.textContent).toContain("20 + 45 = 65 min");
    expect(doc.querySelector("[data-shortcut-math]")?.textContent).toContain("20 + 0 + 20 = 40 min");
    expect(doc.querySelector("[data-reveal]")?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector("[data-endpoint-prompt]")?.hasAttribute("hidden")).toBe(true);
  });

  it("makes the one-way topology and overlapping road loads explicit", () => {
    const copy = (doc.querySelector("[data-network-wrap]")?.textContent ?? "").replace(/\s+/g, " ");
    expect(copy).toContain("All roads are one-way: Home → Work");
    expect(copy).toContain("connector goes top → bottom");
    expect(copy).toContain("only shortcut path is top narrow → connector → bottom narrow");
    expect(doc.querySelectorAll("[data-direction-arrow]")).toHaveLength(5);
    expect(doc.querySelectorAll("[data-narrow-breakdown]")).toHaveLength(2);
  });

  it("makes the controlled comparison explicit in the reveal", () => {
    const copy = (doc.body.textContent ?? "").replace(/\s+/g, " ");
    expect(copy).toContain("Shortcut closed 65 min 4,000 drivers split evenly");
    expect(copy).toContain("Shortcut open 80 min The same 4,000 use both narrow roads");
    expect(copy).toContain("One extra road made the same crowd slower");
    expect(copy).toContain("80 minutes still beats 85 alone");
    expect(copy).not.toContain("Each driver saved time by switching");
  });

  it("does not import the old opaque simulation into the interface", () => {
    for (const fragment of ["src/live", "src/story", "src/experiment", "Math.random", "requestAnimationFrame", "setInterval"]) {
      expect(mainSource).not.toContain(fragment);
    }
    expect(mainSource).toContain('from "./src/braess"');
    expect(mainSource).toContain("const DRIVERS_PER_DOT = 50");
    expect(mainSource).toContain('dot.dataset.origin = index < DOTS_PER_OLD_ROUTE ? "top" : "bottom"');
    expect(mainSource).toContain("BRAESS_LANDMARKS");
    expect(mainSource).toContain("BEST_RESULT.individualSavingMinutes");
    expect(mainSource).not.toContain("setTimeout");
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
    expect(doc.querySelector("[data-reveal]")?.getAttribute("tabindex")).toBe("-1");
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
