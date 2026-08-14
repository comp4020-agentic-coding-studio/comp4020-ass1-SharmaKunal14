// Checks that need a real browser, because jsdom does no layout: it will happily
// report a page as fine while it scrolls sideways at 390px.
//
// These run against the BUILT site in dist/, served over HTTP, so they check the
// thing that deploys. The assignment's artefact band is specifically "holds up
// under use it wasn't designed for: the keyboard, a resize mid-interaction, a slow
// connection", so those three are the ones written down here.

import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = resolve("dist");
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

let server: Server;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  try {
    await stat(join(DIST, "index.html"));
  } catch {
    throw new Error(`${DIST}/index.html not found — run \`pnpm build\` first`);
  }

  server = createServer(async (request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    const target = join(DIST, normalize(path === "/" ? "/index.html" : path));
    if (!target.startsWith(DIST)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  origin = `http://127.0.0.1:${address.port}/`;

  try {
    browser = await chromium.launch();
  } catch (cause) {
    throw new Error(
      "could not launch chromium — run `pnpm exec playwright install chromium`",
      { cause },
    );
  }
}, 90_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => server?.close(() => done()));
});

async function open(viewport: { width: number; height: number }): Promise<{
  page: Page;
  errors: string[];
}> {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // ?speed raises the wall-clock compression only: identical timestep, seed and
  // simulated seconds, so this watches the same run in a fraction of the time.
  await page.goto(`${origin}?speed=400`, { waitUntil: "load" });
  // The page pre-rolls a settled peak hour before its first paint, so an average
  // exists immediately; this only waits for the first frame.
  await page.waitForFunction(
    () => document.querySelector("[data-metric-value]")?.textContent !== "—",
    null,
    { timeout: 20_000 },
  );
  return { page, errors };
}

function overflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

describe.each([
  ["desktop 1920x1080", DESKTOP],
  ["phone 390x844", PHONE],
])("%s", (_name, viewport) => {
  it("renders the network and an average commute, with no console errors", async () => {
    const { page, errors } = await open(viewport);
    const state = await page.evaluate(() => ({
      metric: document.querySelector("[data-metric-value]")?.textContent ?? "",
      vehicles: [...document.querySelectorAll<SVGElement>(".vehicle")].filter(
        (dot) => dot.style.display !== "none",
      ).length,
      roads: document.querySelectorAll(".road").length,
      action: document.querySelector("[data-action]")?.textContent ?? "",
    }));
    expect(state.metric).toMatch(/^\d+:\d{2}$/);
    expect(state.roads).toBe(5);
    expect(state.vehicles).toBeGreaterThan(20);
    expect(state.action.toLowerCase()).toContain("build");
    expect(errors).toEqual([]);
    await page.close();
  });

  it("never scrolls sideways", async () => {
    const { page } = await open(viewport);
    expect(await overflow(page)).toBe(false);
    // Also with the reveal open, which adds the longest lines on the page.
    await page.locator("[data-action]").click();
    await page.waitForFunction(() => document.body.dataset.act === "worse", null, {
      timeout: 90_000,
    });
    expect(await overflow(page)).toBe(false);
    await page.close();
  }, 60_000);

  it("keeps every drawn vehicle inside the picture", async () => {
    // A vehicle parked at an off-canvas coordinate used to render as a stray dot
    // beside the network, which looked like a simulation bug and wasn't one.
    const { page } = await open(viewport);
    const strays = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>("svg.network");
      if (svg === null) return -1;
      const box = svg.viewBox.baseVal;
      return [...document.querySelectorAll<SVGCircleElement>(".vehicle")]
        .filter((dot) => dot.style.display !== "none")
        .filter((dot) => {
          const x = Number(dot.getAttribute("cx"));
          const y = Number(dot.getAttribute("cy"));
          return x < -1 || y < -1 || x > box.width + 1 || y > box.height + 1;
        }).length;
    });
    expect(strays).toBe(0);
    await page.close();
  });
});

describe("the core interaction works from the keyboard alone", () => {
  it("reaches the button by Tab, builds with Enter, and closes with Space", async () => {
    const { page, errors } = await open(DESKTOP);

    // Tab until focus lands on the action. A trap or an unreachable control shows
    // up here as never arriving.
    let reached = false;
    for (let i = 0; i < 12 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(
        () => document.activeElement?.getAttribute("data-action") !== null,
      );
    }
    expect(reached, "Tab never reached the primary action").toBe(true);

    const focusRing = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return "";
      return getComputedStyle(active).outlineStyle;
    });
    expect(focusRing).not.toBe("none");

    await page.keyboard.press("Enter");
    // The story advances on measured state, so each beat is waited for by name.
    await page.waitForFunction(() => document.body.dataset.act === "trying", null, {
      timeout: 10_000,
    });
    await page.waitForFunction(() => document.body.dataset.act === "switching", null, {
      timeout: 90_000,
    });
    await page.waitForFunction(() => document.body.dataset.act === "worse", null, {
      timeout: 90_000,
    });

    // Focus must never be dropped on the floor when the button comes and goes:
    // hiding a focused element sends focus to <body> and loses the visitor's place.
    const kept = await page.evaluate(() => document.activeElement !== document.body);
    expect(kept, "focus was dropped to <body> when the action was hidden").toBe(true);

    // The reveal takes focus, so the outcome is what a keyboard visitor meets.
    const focusedHeadline = await page.evaluate(
      () => document.activeElement?.getAttribute("data-headline") !== null,
    );
    expect(focusedHeadline).toBe(true);
    const finding = await page.locator("[data-finding-kicker]").textContent();
    expect(finding?.length ?? 0).toBeGreaterThan(20);
    // The punchline has to be on the page, with numbers: the drivers who never
    // switched are slower too.
    const rows = await page.locator(".finding__row").count();
    expect(rows).toBe(2);

    // And Tab from the reveal reaches the next action, rather than restarting.
    await page.keyboard.press("Tab");
    const next = await page.evaluate(
      () => document.activeElement?.getAttribute("data-action") !== null,
    );
    expect(next, "Tab from the reveal did not reach the next action").toBe(true);

    await page.locator("[data-action]").focus();
    await page.keyboard.press(" ");
    await page.waitForFunction(() => document.body.dataset.act === "closed", null, {
      timeout: 10_000,
    });
    // The name is revealed only once the recovery has settled, not the instant the
    // road shuts.
    await page.waitForFunction(
      () => document.querySelector("[data-closing]")?.hasAttribute("hidden") === false,
      null,
      { timeout: 90_000 },
    );
    expect(await page.locator("[data-closing]").isVisible()).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, 90_000);
});

describe("resizing mid-interaction", () => {
  it("keeps the phase, the numbers and the running simulation", async () => {
    const { page, errors } = await open(DESKTOP);
    await page.locator("[data-action]").click();
    await page.waitForFunction(() => document.body.dataset.act === "trying", null, {
      timeout: 10_000,
    });

    const before = await page.evaluate(() => ({
      phase: document.body.dataset.act,
      simTrips: document.querySelectorAll<SVGElement>(".vehicle").length,
      layout: document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout,
    }));
    expect(before.layout).toBe("wide");

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => ({
      phase: document.body.dataset.act,
      layout: document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout,
      metric: document.querySelector("[data-metric-value]")?.textContent ?? "",
      connectorVisible:
        document.querySelector("svg.network")?.classList.contains("network--connector-open") ??
        false,
    }));
    // Geometry changed; the run did not restart and the decision still holds.
    expect(after.layout).toBe("tall");
    expect(after.phase).toBe(before.phase);
    expect(after.metric).toMatch(/^\d+:\d{2}$/);
    expect(after.connectorVisible).toBe(true);
    expect(await overflow(page)).toBe(false);

    // And the simulation is still advancing, not frozen by the resize.
    const read = (): Promise<number> =>
      page.evaluate(
        () => (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      );
    const t1 = await read();
    await page.waitForTimeout(1000);
    const t2 = await read();
    expect(t2, "simulated time stopped advancing after the resize").toBeGreaterThan(t1);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});

describe("reduced motion", () => {
  it("still runs the simulation and still explains itself", async () => {
    // Turning the simulation off under reduced motion would remove the
    // explanation, not the decoration. What must go is easing, not the traffic.
    const page = await browser.newPage({ viewport: DESKTOP, reducedMotion: "reduce" });
    await page.goto(`${origin}?speed=400`, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.querySelector("[data-metric-value]")?.textContent !== "—",
      null,
      { timeout: 20_000 },
    );
    const state = await page.evaluate(() => ({
      metric: document.querySelector("[data-metric-value]")?.textContent ?? "",
      roadTransition: getComputedStyle(document.querySelector(".road") as Element).transitionDuration,
      loadWords: [...document.querySelectorAll("[data-loads] li")].map((n) => n.textContent ?? ""),
    }));
    expect(state.metric).toMatch(/^\d+:\d{2}$/);
    // Decoration is gone…
    expect(Number.parseFloat(state.roadTransition)).toBeLessThan(0.01);
    // …and the state is still readable as words, not only as colour or motion.
    expect(state.loadWords.filter((word) => word.length > 0).length).toBeGreaterThan(3);
    await page.close();
  }, 60_000);
});

describe("the model note discloses what it has to", () => {
  it("names the model, the synthetic network, the seed control and the conditionality", async () => {
    // The brief for this project requires the note to say what is simplified,
    // what the model is, that demand is fixed across the comparison, and that the
    // same simulator produces non-Braess outcomes. Prose drifts; this pins it.
    const { page } = await open(DESKTOP);
    // Whitespace-normalised: the note is written as a wrapped template literal, so
    // a phrase can straddle a line break in the source without being wrong.
    const note = ((await page.locator("[data-model-note]").textContent()) ?? "").replace(
      /\s+/g,
      " ",
    );
    const lower = note.toLowerCase();
    for (const required of [
      "intelligent driver model",
      "treiber",
      "invented",
      "same random seed",
      "no equation",
      "lane changing",
      "poisson",
      "braess",
    ]) {
      expect(lower, `model note no longer mentions "${required}"`).toContain(required);
    }
    // It has to carry the control case with a real number in it.
    expect(note).toMatch(/\d+ cars an hour/);
    // And it must not oversell: the effect is named as a few per cent.
    expect(lower).toContain("per cent");
    await page.close();
  }, 60_000);
});

describe("the payload stays small enough for a slow connection", () => {
  it("ships well under 150 kB of JS and CSS", async () => {
    const { readdir } = await import("node:fs/promises");
    const assets = await readdir(join(DIST, "assets"));
    let bytes = 0;
    for (const name of assets) {
      if (!/\.(js|css)$/.test(name)) continue;
      bytes += (await stat(join(DIST, "assets", name))).size;
    }
    expect(bytes).toBeGreaterThan(0);
    expect(bytes, `${(bytes / 1024).toFixed(1)} kB of JS+CSS`).toBeLessThan(150 * 1024);
  });

  it("loads no third-party resources at all", async () => {
    // Nothing to be slow, nothing to 404 on GitHub Pages, nothing to leak a
    // visitor's request to another host.
    const page = await browser.newPage({ viewport: DESKTOP });
    const external: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) {
        external.push(request.url());
      }
    });
    await page.goto(origin, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    expect(external).toEqual([]);
    await page.close();
  }, 60_000);
});
