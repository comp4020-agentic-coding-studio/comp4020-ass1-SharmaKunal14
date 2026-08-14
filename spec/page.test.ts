// Contracts for the page itself, from this assignment's published spec:
// static and client-side, one strong idea and nothing else, and a core
// interaction plain enough to write a test for.
//
// These run against the built site, and they are contracts rather than markup
// snapshots — they should survive a redesign and fail on a change of scope.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { CONTROL, TARGET, networkOf } from "../src/experiment/config.ts";
import { routeFreeFlowTime } from "../src/sim/network.ts";
import { compare } from "../src/experiment/run.ts";
import { EXPERIMENT } from "../src/experiment/result.generated.ts";

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("the numbers on the page are the numbers we tested", () => {
  // The page quotes a controlled experiment rather than whatever a visitor's
  // browser happens to produce, so the quoted figures have to still be true.
  // Regenerate with: mise exec -- node scripts/snapshot.ts
  const STALE = "src/experiment/result.generated.ts is stale — run `node scripts/snapshot.ts`";

  it("matches a fresh target run", () => {
    const fresh = compare(TARGET);
    expect(Math.round(fresh.closed.meanTravelTime * 10) / 10, STALE).toBe(
      EXPERIMENT.target.closedSeconds,
    );
    expect(Math.round(fresh.open.meanTravelTime * 10) / 10, STALE).toBe(
      EXPERIMENT.target.openSeconds,
    );
  });

  it("matches a fresh control run", () => {
    const fresh = compare(CONTROL);
    expect(Math.round(fresh.deltaPercent * 10) / 10, STALE).toBe(EXPERIMENT.control.deltaPercent);
  });

  it("still tells the story the copy tells: target worse, control better", () => {
    expect(EXPERIMENT.target.deltaSeconds).toBeGreaterThan(0);
    expect(EXPERIMENT.control.deltaSeconds).toBeLessThan(0);
    expect(EXPERIMENT.target.seeds.signHeld).toBe(true);
    expect(EXPERIMENT.control.seeds.signHeld).toBe(true);
    expect(EXPERIMENT.target.horizonInvariant).toBe(true);
    expect(EXPERIMENT.control.horizonInvariant).toBe(true);
  });

  it("keeps the opening claim honest about how good the shortcut looks", () => {
    // The first beat tells the visitor the link is "about half a minute quicker, on
    // an empty road". That is a measurable claim about this network, and it was
    // wrong when written — the copy said "about a minute" against a real saving of
    // 31 seconds. Tie it to the geometry so calibration cannot quietly falsify it.
    const network = networkOf(TARGET);
    const saving =
      routeFreeFlowTime(network, "north") - routeFreeFlowTime(network, "shortcut");
    const body = doc.querySelector("[data-body]")?.textContent ?? "";
    expect(body).toMatch(/half a minute/i);
    expect(
      saving,
      `the link's empty-road saving is ${saving.toFixed(0)}s, so "half a minute" is wrong`,
    ).toBeGreaterThan(20);
    expect(saving).toBeLessThan(45);
  });
});

describe("one idea, one mechanic, nothing else", () => {
  // A scope guard with teeth. Every rejected feature in this project — demand
  // sliders, speed sliders, a second network, a dashboard — arrives as a new
  // control, so the number of controls is the thing to hold down.
  it("offers exactly one primary action", () => {
    expect(doc.querySelectorAll("[data-action]")).toHaveLength(1);
  });

  it("has no sliders, dropdowns, or text inputs anywhere", () => {
    expect(doc.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("has no controls beyond the one action and the route legend", () => {
    const buttons = [...doc.querySelectorAll("button")];
    const actions = buttons.filter((b) => b.hasAttribute("data-action"));
    const routes = buttons.filter((b) => b.hasAttribute("data-route"));
    expect(actions).toHaveLength(1);
    // Route items are inspection of an object already on screen, not a mechanic:
    // one per route and no more.
    expect(routes).toHaveLength(3);
    expect(buttons).toHaveLength(actions.length + routes.length);
  });

  it("asks nothing of the visitor before the decision but a few lines", () => {
    // "The visitor should not need to read a paragraph before pressing the main
    // button." Text before the decision is the first thing to bloat, so it is
    // budgeted.
    const lede = words(doc.querySelector("h1")?.textContent ?? "");
    const prompt = words(doc.querySelector("[data-body]")?.textContent ?? "");
    expect(lede).toBeLessThanOrEqual(20);
    expect(prompt).toBeLessThanOrEqual(45);
    expect(
      lede + prompt,
      `${lede + prompt} words before the button — this is meant to be an interaction, not an essay`,
    ).toBeLessThanOrEqual(55);
  });

  it("names the paradox only after the outcome, never before it", () => {
    // The visitor should meet the phenomenon before its name. Anything revealed
    // up front spoils the one thing the interaction is for.
    const upFront = [
      doc.querySelector("h1")?.textContent ?? "",
      doc.querySelector("[data-prompt]")?.textContent ?? "",
      doc.title,
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    ].join(" ");
    expect(upFront.toLowerCase()).not.toContain("braess");
    expect(upFront.toLowerCase()).not.toContain("paradox");
    // And it is named in a section that starts hidden.
    const closing = doc.querySelector("[data-closing]");
    expect(closing?.hasAttribute("hidden")).toBe(true);
    expect(closing?.textContent?.toLowerCase()).toContain("braess");
  });
});

describe("static and client-side throughout", () => {
  it("loads no third-party origin from the markup", () => {
    for (const node of doc.querySelectorAll("[src], [href]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("http://") || url.startsWith("//"), `external: ${url}`).toBe(false);
      if (url.startsWith("https://")) {
        // Prose citations may link out; loaded resources may not.
        expect(node.tagName, `loads from another origin: ${url}`).toBe("A");
      }
    }
  });

  it("uses relative asset paths, so it works under a GitHub Pages sub-path", () => {
    for (const node of doc.querySelectorAll("script[src], link[rel=stylesheet]")) {
      const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
      expect(url.startsWith("/"), `absolute path 404s under /<repo>/: ${url}`).toBe(false);
    }
  });
});

describe("accessibility that markup can carry", () => {
  it("gives the decision a real button, not a clickable div", () => {
    const action = doc.querySelector("[data-action]");
    expect(action?.tagName).toBe("BUTTON");
    expect(action?.getAttribute("type")).toBe("button");
  });

  it("has a live region for state changes a screen reader cannot see", () => {
    const live = doc.querySelector("[aria-live]");
    expect(live).not.toBeNull();
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("offers a skip link to the network", () => {
    const skip = doc.querySelector(".skip-link");
    expect(skip?.getAttribute("href")).toBe("#stage");
    expect(doc.querySelector("#stage")).not.toBeNull();
  });

  it("keeps headings in order under the single h1", () => {
    const levels = [...doc.querySelectorAll("h1, h2, h3")].map((h) =>
      Number(h.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("the process evidence meets this assignment's own requirements", () => {
  // I once wrote "574 words" in a commit message for a file that held 679. The
  // brief sets 400–600 words and three or four moments, and both are checkable, so
  // neither should ever again depend on me estimating.
  const process = readFileSync(resolve("PROCESS.md"), "utf8");

  function prose(markdown: string): string[] {
    return markdown
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links count as their text
      .replace(/[#*`_]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  }

  it("runs to 400-600 words", () => {
    const count = prose(process).length;
    expect(count, `PROCESS.md is ${count} words; the brief asks for 400-600`).toBeGreaterThanOrEqual(
      400,
    );
    expect(count, `PROCESS.md is ${count} words; the brief asks for 400-600`).toBeLessThanOrEqual(
      600,
    );
  });

  it("carries three or four moments, not more", () => {
    const moments = process.match(/^\*\*\d+\. /gm) ?? [];
    expect(moments.length, "three or four, because each needs room to do its job").toBeGreaterThanOrEqual(3);
    expect(moments.length).toBeLessThanOrEqual(4);
  });

  it("cites every moment", () => {
    const moments = process.split(/^\*\*\d+\. /m).slice(1);
    for (const [index, moment] of moments.entries()) {
      expect(
        /\[`[0-9a-f]{7,40}(\.\.\.[0-9a-f]{7,40})?`\]\(/.test(moment),
        `moment ${index + 1} has no commit citation`,
      ).toBe(true);
    }
  });

  it("has a reflection under the name the marker reads", () => {
    expect(() => readFileSync(resolve("reflections/assignment-1.md"), "utf8")).not.toThrow();
  });
});

describe("colour contrast meets WCAG AA in both themes", () => {
  // Recomputed from styles.css rather than trusted, because contrast is the one
  // design property that is invisible until someone cannot read the page. Two of
  // these were failing when this was first measured: the token behind every label
  // (2.95:1) and the token behind the roads themselves (1.90:1).
  const css = readFileSync(resolve("styles.css"), "utf8");

  function tokensIn(block: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const [, name, hex] of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      found[name] = hex;
    }
    return found;
  }

  function relativeLuminance(hex: string): number {
    const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // `:root { … }` is the light theme; the dark block overrides a subset of it.
  const light = tokensIn(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
  const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  const dark = { ...light, ...tokensIn(darkBlock.slice(0, darkBlock.indexOf("}\n}"))) };

  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(theme, () => {
      it("has every text token at 4.5:1 or better against the page", () => {
        for (const token of ["ink", "ink-soft", "ink-faint"]) {
          const ratio = contrast(tokens[token], tokens.paper);
          expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --paper, needs 4.5:1`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("has every meaningful graphic at 3:1 or better", () => {
        // The roads are the primary object and the connector is the thing the
        // whole page is about; neither may be a subtle tint.
        for (const token of ["road", "road-slow", "road-crawl", "connector", "focus"]) {
          const ratio = contrast(tokens[token], tokens.paper);
          expect(ratio, `--${token} is ${ratio.toFixed(2)}:1 on --paper, needs 3:1`).toBeGreaterThanOrEqual(3);
        }
      });

      it("has readable text on the primary action", () => {
        const ratio = contrast(tokens.paper, tokens.accent);
        expect(ratio, `button label is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
