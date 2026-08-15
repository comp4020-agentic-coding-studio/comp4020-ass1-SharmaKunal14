// Checks that need a real browser because jsdom does no layout. These run against
// the built site in dist/, served over HTTP, so they exercise the artefact that is
// actually deployed at both marking viewports.

import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = resolve("dist");
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };
const TEST_SPEED = 400;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

type StateId = "decide" | "watch" | "verdict" | "recover" | "reveal";

type ObservedPage = {
  readonly page: Page;
  readonly errors: string[];
  readonly failedSameOrigin: string[];
  readonly externalRequests: string[];
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
    const pathname = (request.url ?? "/").split("?")[0];
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = resolve(DIST, relative);
    if (target !== DIST && !target.startsWith(`${DIST}/`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      });
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

async function open(
  viewport: { width: number; height: number },
  options: {
    readonly speed?: number;
    readonly reducedMotion?: "reduce";
    readonly responseLatencyMs?: number;
  } = {},
): Promise<ObservedPage> {
  const page = await browser.newPage({
    viewport,
    ...(options.reducedMotion === undefined
      ? {}
      : { reducedMotion: options.reducedMotion }),
  });
  const errors: string[] = [];
  const failedSameOrigin: string[] = [];
  const externalRequests: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith("data:")) externalRequests.push(url);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(origin)) {
      failedSameOrigin.push(`${request.url()} (${request.failure()?.errorText ?? "failed"})`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      failedSameOrigin.push(`${response.url()} (${response.status()})`);
    }
  });
  const responseLatencyMs = options.responseLatencyMs;
  if (responseLatencyMs !== undefined) {
    await page.route("**/*", async (route) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, responseLatencyMs));
      await route.continue();
    });
  }

  // This changes wall-clock compression only. The simulation still advances in
  // its fixed timestep with the same seed and schedule.
  await page.goto(`${origin}?speed=${options.speed ?? TEST_SPEED}`, { waitUntil: "load" });
  await waitForState(page, "decide");
  await page.waitForFunction(
    () => document.querySelector("[data-metric-value]")?.textContent !== "—",
    null,
    { timeout: 20_000 },
  );

  return { page, errors, failedSameOrigin, externalRequests };
}

async function waitForState(page: Page, state: StateId, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.body.dataset.state === expected,
    state,
    { timeout },
  );
}

function overflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

function durationSeconds(value: string): number {
  const match = /^(\d+):(\d{2})$/.exec(value.trim());
  if (match === null) throw new Error(`not a duration: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function expectHealthy(observed: ObservedPage): void {
  expect(observed.errors).toEqual([]);
  expect(observed.failedSameOrigin).toEqual([]);
  expect(observed.externalRequests).toEqual([]);
}

async function expectVerdict(page: Page): Promise<void> {
  expect(await page.locator("[data-comparison]").isVisible()).toBe(true);
  const closedText = (await page.locator("[data-closed-value]").textContent())?.trim() ?? "";
  const openText = (await page.locator("[data-open-value]").textContent())?.trim() ?? "";
  const deltaText = (await page.locator("[data-delta-value]").textContent())?.trim() ?? "";
  const closed = durationSeconds(closedText);
  const opened = durationSeconds(openText);

  expect(opened, `${openText} should be slower than ${closedText}`).toBeGreaterThan(closed);
  expect(opened - closed).toBe(13);
  expect(deltaText).toBe("+13 seconds");
  const status = (await page.locator("[data-status]").textContent()) ?? "";
  expect(status).toContain("106 of 280");
  expect(status).toContain("38%");
}

async function expectInitialScene(page: Page, layout: "wide" | "tall"): Promise<void> {
  const state = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>("svg.network");
    const box = svg?.viewBox.baseVal;
    const visibleVehicles = [...document.querySelectorAll<SVGCircleElement>(".vehicle")].filter(
      (dot) => getComputedStyle(dot).display !== "none",
    );
    const strays =
      box === undefined
        ? -1
        : visibleVehicles.filter((dot) => {
            const x = Number(dot.getAttribute("cx"));
            const y = Number(dot.getAttribute("cy"));
            return x < -1 || y < -1 || x > box.width + 1 || y > box.height + 1;
          }).length;
    return {
      story: document.body.dataset.state,
      metric: document.querySelector("[data-metric-value]")?.textContent ?? "",
      roads: document.querySelectorAll(".road").length,
      vehicles: visibleVehicles.length,
      strays,
      layout: svg?.dataset.layout,
      action: document.querySelector("[data-action]")?.textContent ?? "",
    };
  });

  expect(state.story).toBe("decide");
  expect(state.metric).toMatch(/^\d+:\d{2}$/);
  expect(state.roads).toBe(5);
  expect(state.vehicles).toBeGreaterThan(20);
  expect(state.strays).toBe(0);
  expect(state.layout).toBe(layout);
  expect(state.action.toLowerCase()).toContain("build");
  expect(await overflow(page)).toBe(false);
}

describe.each([
  ["desktop 1920x1080", DESKTOP, "wide"],
  ["phone 390x844", PHONE, "tall"],
] as const)("%s", (_name, viewport, layout) => {
  it("completes decide → watch → verdict → recover → reveal", async () => {
    const observed = await open(viewport);
    const { page } = observed;
    await expectInitialScene(page, layout);

    await page.locator("[data-action]").click();
    await waitForState(page, "watch", 10_000);
    expect(await page.locator("[data-action]").isHidden()).toBe(true);
    expect(
      await page.locator("svg.network").evaluate((svg) =>
        svg.classList.contains("network--connector-open"),
      ),
    ).toBe(true);
    expect(await overflow(page)).toBe(false);

    await waitForState(page, "verdict");
    await expectVerdict(page);
    expect((await page.locator("[data-action]").textContent())?.toLowerCase()).toContain("close");
    expect(await overflow(page)).toBe(false);

    await page.locator("[data-action]").click();
    await waitForState(page, "recover", 10_000);
    expect(
      await page.locator("svg.network").evaluate((svg) =>
        svg.classList.contains("network--connector-open"),
      ),
    ).toBe(false);

    await waitForState(page, "reveal");
    expect((await page.locator("[data-headline]").textContent())?.toLowerCase()).toContain(
      "braess",
    );
    expect(await page.locator("[data-afterword]").isVisible()).toBe(true);
    expect((await page.locator("[data-action]").textContent())?.toLowerCase()).toContain("again");
    expect(await overflow(page)).toBe(false);
    expectHealthy(observed);
    await page.close();
  }, 60_000);
});

describe("phone first viewport", () => {
  it("shows the complete initial CTA without scrolling", async () => {
    const observed = await open(PHONE);
    const { page } = observed;
    const button = page.locator("[data-action]");
    expect(await button.isVisible()).toBe(true);
    const box = await button.boundingBox();
    if (box === null) throw new Error("Build button has no layout box");

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height + 0.5);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expectHealthy(observed);
    await page.close();
  });
});

describe("keyboard-only flow", () => {
  it("builds with Enter, closes with Space, and preserves a useful focus path", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;

    let reachedAction = false;
    for (let index = 0; index < 10 && !reachedAction; index += 1) {
      await page.keyboard.press("Tab");
      reachedAction = await page.evaluate(
        () => document.activeElement?.getAttribute("data-action") !== null,
      );
    }
    expect(reachedAction, "Tab never reached the primary action").toBe(true);

    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return { style: "", width: "0px" };
      const computed = getComputedStyle(active);
      return { style: computed.outlineStyle, width: computed.outlineWidth };
    });
    expect(focus.style).not.toBe("none");
    expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await waitForState(page, "watch", 10_000);
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-headline") !== null,
      ),
    ).toBe(true);

    await waitForState(page, "verdict");
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-headline") !== null,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-action") !== null),
    ).toBe(true);

    await page.keyboard.press("Space");
    await waitForState(page, "recover", 10_000);
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-headline") !== null,
      ),
    ).toBe(true);

    await waitForState(page, "reveal");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-action") !== null),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await waitForState(page, "decide", 10_000);
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-headline") !== null,
      ),
    ).toBe(true);

    expectHealthy(observed);
    await page.close();
  }, 60_000);
});

describe("resizing during the live run", () => {
  it("keeps watch state, connector state, and monotonically advancing simulation time", async () => {
    // Slower presentation compression keeps the page in `watch` while the browser
    // is resized; the underlying timestep and deterministic run are unchanged.
    const observed = await open(DESKTOP, { speed: 100 });
    const { page } = observed;
    await page.locator("[data-action]").click();
    await waitForState(page, "watch", 10_000);

    const before = await page.evaluate(() => ({
      state: document.body.dataset.state,
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      layout: document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout,
    }));
    expect(before.state).toBe("watch");
    expect(before.layout).toBe("wide");

    await page.setViewportSize(PHONE);
    await page.waitForFunction(
      () => document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout === "tall",
      null,
      { timeout: 10_000 },
    );
    const after = await page.evaluate(() => ({
      state: document.body.dataset.state,
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      connectorOpen:
        document.querySelector("svg.network")?.classList.contains("network--connector-open") ??
        false,
    }));

    expect(after.state).toBe("watch");
    expect(after.time).toBeGreaterThanOrEqual(before.time);
    expect(after.connectorOpen).toBe(true);
    expect(await overflow(page)).toBe(false);

    await page.waitForTimeout(300);
    const later = await page.evaluate(
      () => (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
    );
    expect(later, "simulation stopped after the resize").toBeGreaterThan(after.time);
    expect(await page.evaluate(() => document.body.dataset.state)).toBe("watch");
    expectHealthy(observed);
    await page.close();
  }, 60_000);
});

describe("reduced motion", () => {
  it("hides moving vehicles while the simulation and text explanation continue", async () => {
    const observed = await open(DESKTOP, { reducedMotion: "reduce" });
    const { page } = observed;
    const before = await page.evaluate(() => ({
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      vehicles: document.querySelectorAll(".vehicle").length,
      visibleVehicles: [...document.querySelectorAll<SVGElement>(".vehicle")].filter(
        (vehicle) => getComputedStyle(vehicle).display !== "none",
      ).length,
      loadWords: [...document.querySelectorAll("[data-loads] li")].map(
        (item) => item.textContent ?? "",
      ),
    }));
    expect(before.vehicles).toBeGreaterThan(20);
    expect(before.visibleVehicles).toBe(0);
    expect(before.loadWords.filter(Boolean).length).toBeGreaterThanOrEqual(4);

    await page.locator("[data-action]").click();
    await waitForState(page, "watch", 10_000);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      visibleVehicles: [...document.querySelectorAll<SVGElement>(".vehicle")].filter(
        (vehicle) => getComputedStyle(vehicle).display !== "none",
      ).length,
      status: document.querySelector("[data-status]")?.textContent?.trim() ?? "",
    }));
    expect(after.time).toBeGreaterThan(before.time);
    expect(after.visibleVehicles).toBe(0);
    expect(after.status.length).toBeGreaterThan(20);
    expectHealthy(observed);
    await page.close();
  }, 60_000);
});

describe("scientific disclosure", () => {
  it("names the model, synthetic scope, fixed timestep, pairing, and control case", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    const note = ((await page.locator(".model-note__body").textContent()) ?? "").replace(
      /\s+/g,
      " ",
    );
    const afterword = ((await page.locator("[data-afterword]").textContent()) ?? "").replace(
      /\s+/g,
      " ",
    );
    const lower = `${note} ${afterword}`.toLowerCase();
    for (const required of [
      "synthetic network",
      "intelligent driver model",
      "fixed 0.25-second timestep",
      "same generated drivers",
      "random seed",
      "lighter traffic",
    ]) {
      expect(lower, `disclosure no longer mentions "${required}"`).toContain(required);
    }
    expect(await page.locator('.model-note a[href^="https://doi.org/"]').count()).toBe(1);
    expectHealthy(observed);
    await page.close();
  });
});

describe("slow-connection and deployment surface", () => {
  it("still reaches a usable phone decision when every response is delayed", async () => {
    // A response delay is not a full bandwidth emulator, but it catches reliance
    // on instant asset arrival. The page has no remote dependencies to amplify it.
    const observed = await open(PHONE, { responseLatencyMs: 350 });
    expect(await observed.page.locator("[data-action]").isVisible()).toBe(true);
    expect(await observed.page.locator("[data-action]").isEnabled()).toBe(true);
    expect(await overflow(observed.page)).toBe(false);
    expectHealthy(observed);
    await observed.page.close();
  });

  it("ships well under 150 kB of JavaScript and CSS", async () => {
    const assets = await readdir(join(DIST, "assets"));
    let bytes = 0;
    for (const name of assets) {
      if (!/\.(js|css)$/.test(name)) continue;
      bytes += (await stat(join(DIST, "assets", name))).size;
    }
    expect(bytes).toBeGreaterThan(0);
    expect(bytes, `${(bytes / 1024).toFixed(1)} kB of JS+CSS`).toBeLessThan(150 * 1024);
  });

  it("loads without external requests, same-origin failures, or runtime errors", async () => {
    const observed = await open(DESKTOP);
    await observed.page.waitForTimeout(500);
    expectHealthy(observed);
    await observed.page.close();
  });
});
