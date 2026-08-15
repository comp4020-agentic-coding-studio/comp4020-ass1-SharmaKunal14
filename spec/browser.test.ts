// Real-browser checks for the built artefact. The story is intentionally tested
// through its public controls rather than by mutating window state: each gate is
// part of the explanation the marker receives.

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

type StateId =
  | "map"
  | "proposal"
  | "quiet"
  | "quiet_result"
  | "peak"
  | "wave_one"
  | "wave_two"
  | "wave_three"
  | "wave_four"
  | "compare"
  | "verdict"
  | "diagnose"
  | "recovery"
  | "synthesis"
  | "reveal";

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

  if (options.responseLatencyMs !== undefined) {
    await page.route("**/*", async (route) => {
      await new Promise((done) => setTimeout(done, options.responseLatencyMs));
      await route.continue();
    });
  }

  await page.goto(`${origin}?speed=${options.speed ?? TEST_SPEED}`, { waitUntil: "load" });
  await waitForState(page, "map");
  await page.waitForFunction(
    () => document.querySelector("[data-metric-value]")?.textContent?.trim() === "5:05",
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

function expectHealthy(observed: ObservedPage): void {
  expect(observed.errors).toEqual([]);
  expect(observed.failedSameOrigin).toEqual([]);
  expect(observed.externalRequests).toEqual([]);
}

async function text(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).textContent()) ?? "").replace(/\s+/g, " ").trim();
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await overflow(page), `horizontal overflow in ${await page.locator("body").getAttribute("data-state")}`).toBe(false);
}

async function expectComparison(
  page: Page,
  expected: {
    readonly closed: string;
    readonly open: string;
    readonly delta: string;
    readonly direction: "better" | "worse";
  },
): Promise<void> {
  expect(await page.locator("[data-comparison]").isVisible()).toBe(true);
  expect(await text(page, "[data-closed-value]")).toBe(expected.closed);
  expect(await text(page, "[data-open-value]")).toBe(expected.open);
  expect(await text(page, "[data-delta-value]")).toBe(expected.delta);
  expect(await page.locator("[data-comparison]").getAttribute("data-direction")).toBe(
    expected.direction,
  );
}

async function activeAnimationCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((target) => {
    const active = new Set(["pending", "running"]);
    return [...document.querySelectorAll<HTMLElement>(target)].reduce(
      (count, element) =>
        count + element.getAnimations().filter((animation) => active.has(animation.playState)).length,
      0,
    );
  }, selector);
}

async function expectDistinctRouteVehicles(page: Page): Promise<void> {
  const observed = await page.evaluate(() => {
    const visible = [...document.querySelectorAll<SVGCircleElement>(".vehicle")].filter(
      (vehicle) => getComputedStyle(vehicle).display !== "none",
    );
    const shortcut = visible.find((vehicle) => vehicle.classList.contains("vehicle--shortcut"));
    const ordinary = visible.find((vehicle) => !vehicle.classList.contains("vehicle--shortcut"));

    const appearance = (vehicle: SVGCircleElement | undefined) => {
      if (vehicle === undefined) return null;
      const style = getComputedStyle(vehicle);
      return {
        fill: style.fill,
        stroke: style.stroke,
        radius: Number(vehicle.getAttribute("r")),
      };
    };

    return {
      shortcutCount: visible.filter((vehicle) =>
        vehicle.classList.contains("vehicle--shortcut"),
      ).length,
      ordinaryCount: visible.filter(
        (vehicle) => !vehicle.classList.contains("vehicle--shortcut"),
      ).length,
      shortcut: appearance(shortcut),
      ordinary: appearance(ordinary),
    };
  });

  expect(observed.shortcutCount).toBeGreaterThan(0);
  expect(observed.ordinaryCount).toBeGreaterThan(0);
  if (observed.shortcut === null || observed.ordinary === null) {
    throw new Error("wave one did not render both shortcut and ordinary vehicles");
  }
  expect(observed.shortcut.radius).toBeGreaterThan(observed.ordinary.radius);
  expect(observed.shortcut.fill).not.toBe(observed.ordinary.fill);
  expect(observed.shortcut.stroke).not.toBe(observed.ordinary.stroke);
}

async function choose(page: Page, value: string): Promise<void> {
  await page.locator(`[data-choice="${value}"]`).click();
}

async function selectRadio(page: Page, group: string, value: string): Promise<void> {
  await page.locator(`input[data-radio="${group}"][value="${value}"]`).check();
}

async function expectInitialScene(page: Page, layout: "wide" | "tall"): Promise<void> {
  const observed = await page.evaluate(() => {
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
      state: document.body.dataset.state,
      metric: document.querySelector("[data-metric-value]")?.textContent?.trim(),
      roads: document.querySelectorAll(".road").length,
      choices: document.querySelectorAll("[data-choice]").length,
      vehicles: visibleVehicles.length,
      strays,
      layout: svg?.dataset.layout,
      action: document.querySelector("[data-action]")?.textContent?.trim(),
      actionDisabled:
        document.querySelector<HTMLButtonElement>("[data-action]")?.disabled ?? false,
    };
  });

  expect(observed).toMatchObject({
    state: "map",
    metric: "5:05",
    roads: 5,
    choices: 2,
    strays: 0,
    layout,
    action: "Continue to the proposal",
    actionDisabled: true,
  });
  // Chapters 1–4 are a reference drawing. Live cars appear only when the user
  // explicitly releases the peak traffic, so the opening should be still.
  expect(observed.vehicles).toBe(0);
  await expectNoOverflow(page);
}

/** Complete chapters 1–3 and stop at the peak-demand route choice. */
async function reachPeak(page: Page): Promise<void> {
  await choose(page, "north");
  await choose(page, "south");
  await page.locator("[data-action]").click();
  await waitForState(page, "proposal");
  await page.locator("[data-action]").click();
  expect(await text(page, "[data-action]")).toBe("Test with light traffic");
  await page.locator("[data-action]").click();
  await waitForState(page, "quiet");
  await selectRadio(page, "quiet-prediction", "help");
  await page.locator("[data-action]").click();
  await waitForState(page, "quiet_result");
  await page.locator("[data-action]").click();
  await waitForState(page, "peak");
}

async function completeCase(page: Page, layout: "wide" | "tall"): Promise<void> {
  await expectInitialScene(page, layout);
  const action = page.locator("[data-action]");

  // Chapter 1 is gated on inspecting both original routes.
  expect(await action.isDisabled()).toBe(true);
  await choose(page, "north");
  expect(await page.locator('[data-choice="north"]').getAttribute("aria-pressed")).toBe("true");
  expect(await action.isDisabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain("1 of 2 viewed");
  await choose(page, "south");
  expect(await action.isEnabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain("same 305 seconds");
  await expectNoOverflow(page);

  await action.click();
  await waitForState(page, "proposal");
  expect(await action.isEnabled()).toBe(true);
  expect(await text(page, "[data-action]")).toBe("Draw the shortcut");
  expect(await page.locator('[data-choice="A"], [data-choice="B"]').count()).toBe(0);
  expect(await page.locator("[data-trace-link]").count()).toBe(0);
  expect(await activeAnimationCount(page, ".story, .measure, .control")).toBeGreaterThan(0);

  await action.click();
  expect(await page.locator("body").getAttribute("data-shortcut-traced")).toBe("true");
  expect(await text(page, "[data-action]")).toBe("Test with light traffic");
  expect(await text(page, "[data-metric-value]")).toBe("5:05 → 4:34");
  expect(await text(page, "[data-metric-context]")).toContain("31 seconds quicker");
  expect(
    await page.locator("[data-trace-link]").evaluateAll((traces) =>
      traces.map((trace) => trace.getAttribute("data-trace-link")),
    ),
  ).toEqual(["SA", "AB", "BT"]);
  expect(await activeAnimationCount(page, ".route-trace")).toBeGreaterThan(0);
  await expectNoOverflow(page);

  // A deliberately wrong quiet-road prediction proves feedback is evidence-led,
  // not a congratulatory branch chosen to match the visitor.
  await action.click();
  await waitForState(page, "quiet");
  expect(await action.isDisabled()).toBe(true);
  await selectRadio(page, "quiet-prediction", "hurt");
  expect(await action.isEnabled()).toBe(true);
  await action.click();
  await waitForState(page, "quiet_result");
  await expectComparison(page, {
    closed: "5:19",
    open: "5:11",
    delta: "−8 seconds",
    direction: "better",
  });
  expect(await text(page, "[data-status]")).toContain("overturns your prediction");
  expect(await text(page, "[data-metric-context]")).toContain("41 of 96");
  expect(await text(page, "[data-metric-context]")).toContain("43%");
  await expectNoOverflow(page);

  await action.click();
  await waitForState(page, "peak");
  expect(await action.isDisabled()).toBe(true);
  await selectRadio(page, "personal-route", "shortcut");
  expect(await action.isEnabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain("model will make its own seeded choices");

  await action.click();
  await waitForState(page, "wave_one");
  expect(await text(page, "[data-metric-value]")).toBe("51%");
  expect(await text(page, "[data-metric-context]")).toBe(
    "46 of 90 choices in this live run.",
  );
  expect(
    await page.locator("svg.network").evaluate((svg) =>
      svg.classList.contains("network--connector-open"),
    ),
  ).toBe(true);
  await expectDistinctRouteVehicles(page);
  await expectNoOverflow(page);

  await action.click();
  await waitForState(page, "wave_two");
  expect(await text(page, "[data-headline]")).toContain("Both short roads");
  await expectNoOverflow(page);
  await action.click();
  await waitForState(page, "wave_three");
  expect(await text(page, "[data-caption]")).toContain("later 38%");
  await expectNoOverflow(page);

  await action.click();
  await waitForState(page, "wave_four");
  expect(await text(page, '[data-load="SA"]')).toMatch(/slowing|slower|queueing/);
  expect(await text(page, '[data-load="BT"]')).toMatch(/slowing|slower|queueing/);
  await expectNoOverflow(page);

  // The comparison cannot run until the visitor selects the only fair design.
  await action.click();
  await waitForState(page, "compare");
  expect(await action.isDisabled()).toBe(true);
  await selectRadio(page, "comparison-design", "different-morning");
  expect(await action.isDisabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain("different departures");
  await selectRadio(page, "comparison-design", "different-demand");
  expect(await action.isDisabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain("second change in demand");
  await selectRadio(page, "comparison-design", "road-only");
  expect(await action.isEnabled()).toBe(true);
  expect(await text(page, "[data-status]")).toContain(
    "same demand, departure schedule and random seed; only the road changes",
  );

  await action.click();
  await waitForState(page, "verdict");
  await expectComparison(page, {
    closed: "5:31",
    open: "5:44",
    delta: "+13 seconds",
    direction: "worse",
  });
  expect(await text(page, "[data-metric-context]")).toContain("106 of 280");
  expect(await text(page, "[data-metric-context]")).toContain("38%");
  expect(await text(page, "[data-status]")).toContain("38% is an outcome, not an input");
  await expectNoOverflow(page);

  // Both bottlenecks must be inspected, and their counts reconstruct why the
  // 106 shortcut trips load both old bridge approaches.
  await action.click();
  await waitForState(page, "diagnose");
  expect(await action.isDisabled()).toBe(true);
  await choose(page, "SA");
  expect(await text(page, "[data-metric-value]")).toBe("131 → 198");
  expect(await text(page, "[data-status]")).toContain("all 106 shortcut trips");
  expect(await action.isDisabled()).toBe(true);
  await choose(page, "BT");
  expect(await text(page, "[data-metric-value]")).toBe("149 → 188");
  expect(await text(page, "[data-status]")).toContain("all 106 shortcut trips");
  expect(await action.isEnabled()).toBe(true);

  await action.click();
  await waitForState(page, "recovery");
  expect(await text(page, "[data-metric-value]")).toBe("0");
  expect(await text(page, "[data-metric-label]")).toContain("post-closure departures yet");
  expect(
    await page.locator("svg.network").evaluate((svg) =>
      svg.classList.contains("network--connector-open"),
    ),
  ).toBe(false);

  await action.click();
  await waitForState(page, "synthesis");
  expect(await text(page, "[data-metric-value]")).toBe("0%");
  expect(await text(page, "[data-metric-label]")).toBe("new choices using the closed link");
  expect(await text(page, "[data-metric-context]")).toMatch(/^0 of \d+ post-closure departures\.$/);
  await expectNoOverflow(page);

  await action.click();
  await waitForState(page, "reveal");
  expect((await text(page, "[data-headline]")).toLowerCase()).toContain("braess");
  expect(await page.locator("[data-afterword]").isVisible()).toBe(true);
  await expectComparison(page, {
    closed: "5:31",
    open: "5:44",
    delta: "+13 seconds",
    direction: "worse",
  });
  await expectNoOverflow(page);

  // Replay must clear all gates rather than carrying completed selections over.
  await action.click();
  await waitForState(page, "map");
  expect(await action.isDisabled()).toBe(true);
  expect(await page.locator('[data-choice][data-complete="true"]').count()).toBe(0);
}

describe.each([
  ["desktop 1920×1080", DESKTOP, "wide"],
  ["phone 390×844", PHONE, "tall"],
] as const)("complete chapter flow · %s", (_name, viewport, layout) => {
  it("gates, measures, diagnoses, closes and reveals the case", async () => {
    const observed = await open(viewport);
    await completeCase(observed.page, layout);
    expectHealthy(observed);
    await observed.page.close();
  }, 90_000);
});

describe("phone opening", () => {
  it("shows the first meaningful controls without horizontal overflow", async () => {
    const observed = await open(PHONE);
    for (const selector of ['[data-choice="north"]', '[data-choice="south"]']) {
      const box = await observed.page.locator(selector).boundingBox();
      if (box === null) throw new Error(`${selector} has no layout box`);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height + 0.5);
    }
    expect(await observed.page.evaluate(() => window.scrollY)).toBe(0);
    await expectNoOverflow(observed.page);
    expectHealthy(observed);
    await observed.page.close();
  });
});

async function tabTo(page: Page, selector: string, limit = 60): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    const matches = await page.evaluate(
      (target) => document.activeElement?.matches(target) ?? false,
      selector,
    );
    if (matches) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${selector}`);
}

async function keyboardChoose(page: Page, selector: string, key: "Enter" | "Space"): Promise<void> {
  await tabTo(page, selector);
  await page.keyboard.press(key);
}

describe("keyboard-only chapter flow", () => {
  it("operates buttons, radio groups and every narrative transition", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;

    await keyboardChoose(page, '[data-choice="north"]', "Enter");
    const focus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement ?? document.body);
      return { outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus.outline).not.toBe("none");
    expect(focus.width).toBeGreaterThan(0);
    await keyboardChoose(page, '[data-choice="south"]', "Space");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "proposal");
    expect(await page.evaluate(() => document.activeElement?.matches("[data-headline]") ?? false)).toBe(true);

    await keyboardChoose(page, "[data-action]", "Enter");
    expect(await text(page, "[data-action]")).toBe("Test with light traffic");
    expect(
      await page.locator("[data-trace-link]").evaluateAll((traces) =>
        traces.map((trace) => trace.getAttribute("data-trace-link")),
      ),
    ).toEqual(["SA", "AB", "BT"]);
    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "quiet");
    expect(await page.evaluate(() => document.activeElement?.matches("[data-headline]") ?? false)).toBe(true);
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.activeElement?.matches("[data-headline]") ?? false)).toBe(true);
    await keyboardChoose(page, 'input[data-radio="quiet-prediction"][value="help"]', "Space");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "quiet_result");
    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "peak");
    // Native radio groups expose one Tab stop; arrow keys move within the group.
    await tabTo(page, 'input[data-radio="personal-route"][value="north"]');
    await page.keyboard.press("ArrowDown");
    expect(
      await page.locator('input[data-radio="personal-route"][value="shortcut"]').isChecked(),
    ).toBe(true);
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "wave_one");

    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "wave_two");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "wave_three");
    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "wave_four");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "compare");
    await keyboardChoose(page, 'input[data-radio="comparison-design"][value="road-only"]', "Space");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "verdict");
    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "diagnose");
    await keyboardChoose(page, '[data-choice="SA"]', "Enter");
    await keyboardChoose(page, '[data-choice="BT"]', "Space");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "recovery");
    await keyboardChoose(page, "[data-action]", "Space");
    await waitForState(page, "synthesis");
    await keyboardChoose(page, "[data-action]", "Enter");
    await waitForState(page, "reveal");

    expect((await text(page, "[data-headline]")).toLowerCase()).toContain("braess");
    await expectNoOverflow(page);
    expectHealthy(observed);
    await page.close();
  }, 90_000);
});

describe("resize during a traffic wave", () => {
  it("preserves the choice, connector and simulation while switching layouts", async () => {
    // Explicit 100× compression leaves roughly four wall-clock seconds to resize
    // while the first fixed-step wave is still running.
    const observed = await open(DESKTOP, { speed: 100 });
    const { page } = observed;
    await reachPeak(page);
    await selectRadio(page, "personal-route", "shortcut");

    const before = await page.evaluate(() => ({
      state: document.body.dataset.state,
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      layout: document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout,
    }));
    expect(before).toMatchObject({ state: "peak", layout: "wide" });

    await page.locator("[data-action]").click();
    await page.waitForFunction(
      () => document.querySelector("[data-action]")?.textContent?.includes("Running traffic wave"),
    );
    await page.setViewportSize(PHONE);
    await page.waitForFunction(
      () => document.querySelector<SVGSVGElement>("svg.network")?.dataset.layout === "tall",
    );
    const during = await page.evaluate(() => ({
      state: document.body.dataset.state,
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      connectorOpen:
        document.querySelector("svg.network")?.classList.contains("network--connector-open") ??
        false,
      disabled: document.querySelector<HTMLButtonElement>("[data-action]")?.disabled,
    }));
    expect(during.state).toBe("peak");
    expect(during.time).toBeGreaterThanOrEqual(before.time);
    expect(during.connectorOpen).toBe(true);
    expect(during.disabled).toBe(true);
    await expectNoOverflow(page);

    await waitForState(page, "wave_one");
    expect(await text(page, "[data-metric-context]")).toContain("46 of 90 choices");
    expect(await page.locator("svg.network").getAttribute("data-layout")).toBe("tall");
    await expectNoOverflow(page);
    expectHealthy(observed);
    await page.close();
  }, 90_000);
});

describe("reduced motion", () => {
  it("uses the same user-paced checkpoints without showing moving vehicles", async () => {
    const observed = await open(DESKTOP, { reducedMotion: "reduce" });
    const { page } = observed;
    const before = await page.evaluate(() => ({
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      vehicles: document.querySelectorAll(".vehicle").length,
      visibleVehicles: [...document.querySelectorAll<SVGElement>(".vehicle")].filter(
        (vehicle) => getComputedStyle(vehicle).display !== "none",
      ).length,
    }));
    expect(before.vehicles).toBeGreaterThan(20);
    expect(before.visibleVehicles).toBe(0);

    await choose(page, "north");
    await choose(page, "south");
    await page.locator("[data-action]").click();
    await waitForState(page, "proposal");
    await page.locator("[data-action]").click();
    expect(
      await page.locator("[data-trace-link]").evaluateAll((traces) =>
        traces.map((trace) => trace.getAttribute("data-trace-link")),
      ),
    ).toEqual(["SA", "AB", "BT"]);
    expect(await activeAnimationCount(page, ".story, .measure, .control, .route-trace")).toBe(0);
    await page.locator("[data-action]").click();
    await waitForState(page, "quiet");
    await selectRadio(page, "quiet-prediction", "help");
    await page.locator("[data-action]").click();
    await waitForState(page, "quiet_result");
    await page.locator("[data-action]").click();
    await waitForState(page, "peak");
    await selectRadio(page, "personal-route", "shortcut");
    const beforeWave = await page.evaluate(
      () => (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
    );
    await page.locator("[data-action]").click();
    await waitForState(page, "wave_one", 10_000);
    const after = await page.evaluate(() => ({
      time: (window as unknown as { simulatedSeconds?: number }).simulatedSeconds ?? 0,
      visibleVehicles: [...document.querySelectorAll<SVGElement>(".vehicle")].filter(
        (vehicle) => getComputedStyle(vehicle).display !== "none",
      ).length,
    }));
    expect(after.time).toBeGreaterThanOrEqual(beforeWave + 400);
    expect(after.visibleVehicles).toBe(0);
    expect(await text(page, "[data-metric-context]")).toContain("46 of 90 choices");

    await page.locator("[data-action]").click();
    await waitForState(page, "wave_two", 10_000);
    expect(await page.locator("[data-action]").isEnabled()).toBe(true);
    await expectNoOverflow(page);
    expectHealthy(observed);
    await page.close();
  }, 60_000);
});

describe("scientific disclosure", () => {
  it("names the model, synthetic scope, pairing and low-demand control", async () => {
    const observed = await open(DESKTOP);
    const note = (await text(observed.page, ".model-note__body")).toLowerCase();
    const afterword = (await text(observed.page, "[data-afterword]")).toLowerCase();
    const disclosure = `${note} ${afterword}`;
    for (const required of [
      "synthetic network",
      "intelligent driver model",
      "fixed 0.25-second timestep",
      "same generated departure schedule",
      "random seed",
      "lighter traffic",
    ]) {
      expect(disclosure, `disclosure no longer mentions "${required}"`).toContain(required);
    }
    expect(await observed.page.locator('.model-note a[href^="https://doi.org/"]').count()).toBe(1);
    expectHealthy(observed);
    await observed.page.close();
  });
});

describe("slow connection and deployment surface", () => {
  it("still reaches a usable first phone interaction when responses are delayed", async () => {
    const observed = await open(PHONE, { responseLatencyMs: 350 });
    expect(await observed.page.locator('[data-choice="north"]').isVisible()).toBe(true);
    expect(await observed.page.locator('[data-choice="north"]').isEnabled()).toBe(true);
    expect(await observed.page.locator("[data-action]").isDisabled()).toBe(true);
    await expectNoOverflow(observed.page);
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

  it("loads without external requests, failed assets or runtime errors", async () => {
    const observed = await open(DESKTOP);
    await observed.page.waitForTimeout(500);
    expectHealthy(observed);
    await observed.page.close();
  });
});
