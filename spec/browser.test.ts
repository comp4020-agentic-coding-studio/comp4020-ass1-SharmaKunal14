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
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

interface ObservedPage {
  page: Page;
  errors: string[];
  failedSameOrigin: string[];
  externalRequests: string[];
}

let server: Server;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  await stat(join(DIST, "index.html"));
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
  browser = await chromium.launch();
}, 90_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => server?.close(() => done()));
});

async function open(viewport: { width: number; height: number }, reducedMotion = false): Promise<ObservedPage> {
  const page = await browser.newPage({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
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
    if (request.url().startsWith(origin)) failedSameOrigin.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      failedSameOrigin.push(`${response.url()} (${response.status()})`);
    }
  });

  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.dataset.complete === "false");
  return { page, errors, failedSameOrigin, externalRequests };
}

function healthy(observed: ObservedPage): void {
  expect(observed.errors).toEqual([]);
  expect(observed.failedSameOrigin).toEqual([]);
  expect(observed.externalRequests).toEqual([]);
}

async function setUsers(page: Page, users: number): Promise<void> {
  await page.locator("#shortcut-users").fill(String(users));
  await page.waitForFunction((value) => document.querySelector("[data-shortcut-output]")?.textContent?.includes(value), users.toLocaleString("en-AU"));
}

async function text(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).textContent()) ?? "").replace(/\s+/g, " ").trim();
}

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
}

describe("transparent desktop experiment", () => {
  it("places controls, map and calculations in three readable columns", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    const columns = await page.evaluate(() => {
      const controls = document.querySelector<HTMLElement>(".explore-card");
      const map = document.querySelector<HTMLElement>("[data-network-wrap]");
      const math = document.querySelector<HTMLElement>(".live-math");
      if (controls === null || map === null || math === null) throw new Error("missing experiment columns");
      const controlsBox = controls.getBoundingClientRect();
      const mapBox = map.getBoundingClientRect();
      const mathBox = math.getBoundingClientRect();
      return {
        controlsLeft: controlsBox.left,
        controlsRight: controlsBox.right,
        controlsTop: controlsBox.top,
        controlsBottom: controlsBox.bottom,
        mapLeft: mapBox.left,
        mapRight: mapBox.right,
        mapTop: mapBox.top,
        mapBottom: mapBox.bottom,
        mathLeft: mathBox.left,
        mathRight: mathBox.right,
        mathTop: mathBox.top,
        mathBottom: mathBox.bottom,
      };
    });
    expect(columns.controlsLeft).toBeLessThan(columns.mapLeft);
    expect(columns.controlsRight).toBeLessThanOrEqual(columns.mapLeft);
    expect(columns.mapRight).toBeLessThanOrEqual(columns.mathLeft);
    expect(columns.mathLeft).toBeLessThan(columns.mathRight);
    expect(columns.controlsTop).toBeCloseTo(columns.mapTop, 0);
    expect(columns.mapTop).toBeCloseTo(columns.mathTop, 0);
    expect(columns.controlsBottom).toBeCloseTo(columns.mapBottom, 0);
    expect(columns.mapBottom).toBeCloseTo(columns.mathBottom, 0);
    await noOverflow(page);
    healthy(observed);
    await page.close();
  });

  it("shows the rules and initial calculation before interaction", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    expect(await page.locator("button").count()).toBe(12);
    expect(await page.locator("[data-play]").count()).toBe(0);
    expect(await page.locator("[data-endpoint-prompt]").isHidden()).toBe(true);
    expect(await page.locator("[data-toggle-road]").isHidden()).toBe(true);
    expect(await page.locator('input[type="range"]').count()).toBe(1);
    expect(await page.locator(".driver-dot").count()).toBe(80);
    expect(await page.locator('.driver-dot[data-route="top"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-route="bottom"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-route="shortcut"]').count()).toBe(0);
    expect(await page.locator('.driver-dot[data-origin="top"][data-route="top"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-origin="bottom"][data-route="bottom"]').count()).toBe(40);
    expect(await text(page, "[data-top-route-ledger]")).toBe("2,000 drivers · 40 dots");
    expect(await text(page, "[data-shortcut-route-ledger]")).toBe("0 drivers · 0 dots");
    expect(await text(page, "[data-bottom-route-ledger]")).toBe("2,000 drivers · 40 dots");
    expect(await page.locator('input[name="prediction"]').count()).toBe(0);
    expect(await page.locator(".prediction").count()).toBe(0);
    expect(await page.locator(".rules article").count()).toBe(3);
    expect(await page.locator("#experiment").evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(DESKTOP.height);
    expect(await text(page, "[data-average-time]")).toBe("65");
    expect(await page.locator("[data-narrow-math]").isVisible()).toBe(true);
    expect(await text(page, "[data-shortcut-math]")).toBe("20 + 0 + 20 = 40 min");
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    await noOverflow(page);
    healthy(observed);
    await page.close();
  });

  it("updates every visible number from the same slider value", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 2_000);
    expect(await text(page, "[data-average-time]")).toBe("67.5");
    expect(await text(page, "[data-narrow-math]")).toBe("2,000 + (2,000 ÷ 2) = 3,000 cars");
    expect(await text(page, "[data-old-math]")).toBe("30 + 45 = 75 min");
    expect(await text(page, "[data-shortcut-math]")).toBe("30 + 0 + 30 = 60 min");
    expect(await text(page, "[data-average-math]")).toBe("(2,000 × 75 + 2,000 × 60) ÷ 4,000 = 67.5 min");
    expect(await text(page, "[data-decision]")).toContain("Switching right now looks 15 minutes better");
    expect(await page.locator('.driver-dot[data-route="top"]').count()).toBe(20);
    expect(await page.locator('.driver-dot[data-route="bottom"]').count()).toBe(20);
    expect(await page.locator('.driver-dot[data-route="shortcut"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-origin="top"][data-route="shortcut"]').count()).toBe(20);
    expect(await page.locator('.driver-dot[data-origin="bottom"][data-route="shortcut"]').count()).toBe(20);
    expect(await text(page, "[data-top-route-ledger]")).toBe("1,000 drivers · 20 dots");
    expect(await text(page, "[data-shortcut-route-ledger]")).toBe("2,000 drivers · 40 dots");
    expect(await text(page, "[data-bottom-route-ledger]")).toBe("1,000 drivers · 20 dots");

    healthy(observed);
    await page.close();
  });

  it("moves two existing dots for each 100-driver step", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    const dotCountBefore = await page.locator(".driver-dot").count();

    await setUsers(page, 100);

    expect(await page.locator(".driver-dot").count()).toBe(dotCountBefore);
    expect(await page.locator('.driver-dot[data-origin="top"][data-route="top"]').count()).toBe(39);
    expect(await page.locator('.driver-dot[data-origin="bottom"][data-route="bottom"]').count()).toBe(39);
    expect(await page.locator('.driver-dot[data-origin="top"][data-route="shortcut"]').count()).toBe(1);
    expect(await page.locator('.driver-dot[data-origin="bottom"][data-route="shortcut"]').count()).toBe(1);
    expect(await text(page, "[data-top-route-ledger]")).toBe("1,950 drivers · 39 dots");
    expect(await text(page, "[data-shortcut-route-ledger]")).toBe("100 drivers · 2 dots");
    expect(await text(page, "[data-bottom-route-ledger]")).toBe("1,950 drivers · 39 dots");

    healthy(observed);
    await page.close();
  });

  it("lets route groups and equations spotlight the same map", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 2_000);

    const shortcutGroup = page.locator('.route-ledger [data-spotlight="shortcut"]');
    await shortcutGroup.click();
    expect(await shortcutGroup.getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator("[data-network]").getAttribute("data-focus")).toBe("shortcut");
    expect(await page.locator("[data-driver-layer]").getAttribute("data-focus")).toBe("shortcut");
    expect(await text(page, "[data-spotlight-copy]")).toBe(
      "These shortcut drivers use both narrow roads and the 0-minute connector.",
    );
    await page.waitForTimeout(220);
    const shortcutOpacity = Number.parseFloat(
      await page.locator('.driver-dot[data-route="shortcut"]').first().evaluate((element) => getComputedStyle(element).opacity),
    );
    const oldOpacity = Number.parseFloat(
      await page.locator('.driver-dot[data-route="top"]').first().evaluate((element) => getComputedStyle(element).opacity),
    );
    expect(shortcutOpacity).toBeGreaterThan(oldOpacity);

    const oldRouteMath = page.locator('.live-math [data-spotlight="old-route"]');
    await oldRouteMath.focus();
    await page.keyboard.press("Space");
    expect(await shortcutGroup.getAttribute("aria-pressed")).toBe("false");
    expect(await oldRouteMath.getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator("[data-network]").getAttribute("data-focus")).toBe("top");
    expect(await text(page, "[data-spotlight-copy]")).toBe(
      "One old route combines one narrow road with one fixed 45-minute road.",
    );
    healthy(observed);
    await page.close();
  });

  it("keeps diagram labels clear of the road strokes", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 2_000);
    const overlaps = await page.evaluate(() => {
      const roads = [...document.querySelectorAll<SVGGeometryElement>(".road")];
      const labels = [...document.querySelectorAll<SVGGraphicsElement>(".road-label text, .shortcut-label text")];
      return labels.filter((label) => {
        const box = label.getBBox();
        const points = [
          new DOMPoint(box.x, box.y),
          new DOMPoint(box.x + box.width, box.y),
          new DOMPoint(box.x, box.y + box.height),
          new DOMPoint(box.x + box.width, box.y + box.height),
          new DOMPoint(box.x + box.width / 2, box.y + box.height / 2),
        ];
        return roads.some((road) => points.some((point) => road.isPointInStroke(point)));
      }).map((label) => label.textContent);
    });
    expect(overlaps).toEqual([]);
    healthy(observed);
    await page.close();
  });

  it("lets the visitor discover the best point and the break-even point", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 500);
    expect(await text(page, "[data-average-time]")).toBe("64.7");
    expect(await text(page, "[data-discovery]")).toContain("You found the best balance");
    expect(await page.locator("[data-town-comparison]").getAttribute("data-state")).toBe("better");
    expect(await text(page, "[data-comparison-verdict]")).toBe("0.3 min faster");
    expect(await page.locator('[data-milestone="best"]').getAttribute("data-state")).toBe("complete");
    expect(await text(page, '[data-milestone="best"] [data-milestone-status]')).toBe("64.7 min found");
    expect(await page.locator('[data-milestone="break-even"]').getAttribute("data-state")).toBe("active");
    expect(await text(page, "[data-challenge-title]")).toBe("When does the shortcut stop helping?");

    await setUsers(page, 1_000);
    expect(await text(page, "[data-average-time]")).toBe("65");
    expect(await text(page, "[data-discovery]")).toContain("Break-even");
    expect(await page.locator("[data-town-comparison]").getAttribute("data-state")).toBe("same");
    expect(await page.locator('[data-milestone="break-even"]').getAttribute("data-state")).toBe("complete");
    expect(await page.locator('[data-milestone="paradox"]').getAttribute("data-state")).toBe("active");
    expect(await text(page, "[data-challenge-title]")).toBe(
      "What happens if drivers keep choosing for themselves?",
    );
    healthy(observed);
    await page.close();
  });

  it("lets one driver group attempt and reject a rescue", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 4_000);
    await page.locator("[data-show-result]").click();
    expect(await page.locator('[data-milestone="paradox"]').getAttribute("data-state")).toBe("complete");

    await page.locator("[data-start-rescue]").click();
    expect(await page.locator("[data-rescue-prompt]").isVisible()).toBe(true);
    expect(await page.locator("#shortcut-users").evaluate((element) => element === document.activeElement)).toBe(true);
    expect(await text(page, "[data-challenge-title]")).toBe("Can 100 drivers improve things for everyone?");
    expect(await page.locator("[data-rescue-result]").isHidden()).toBe(true);

    await setUsers(page, 3_900);
    expect(await text(page, "[data-average-time]")).toBe("79.1");
    expect(await page.locator("[data-rescue-result]").isVisible()).toBe(true);
    expect(await text(page, "[data-rescue-average]")).toBe("79.1 min");
    expect(await text(page, "[data-rescue-old]")).toBe("84.5 min");
    expect(await text(page, "[data-rescue-loss]")).toBe("5.5 min worse for them");
    expect(await text(page, "[data-rescue-result]")).toContain(
      "Moving back helps the town, but it hurts the drivers who move",
    );

    await page.locator("[data-finish-rescue]").click();
    expect(await page.locator("#shortcut-users").inputValue()).toBe("4000");
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    expect(await page.locator("[data-reveal]").evaluate((element) => element === document.activeElement)).toBe(true);
    healthy(observed);
    await page.close();
  });

  it("offers a deliberate comparison before revealing the paradox", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 4_000);
    expect(await text(page, "[data-average-time]")).toBe("80");
    expect(await text(page, "[data-average-change]")).toBe("15 min slower than without the shortcut");
    expect(await page.locator("[data-endpoint-prompt]").isVisible()).toBe(true);
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    expect(await page.locator("[data-toggle-road]").isHidden()).toBe(true);
    expect(Number.parseFloat(await page.locator("[data-endpoint-prompt]").evaluate((element) => getComputedStyle(element).animationDuration))).toBeGreaterThan(0.3);
    const promptPlacement = await page.locator("[data-endpoint-prompt]").evaluate((prompt) => {
      const slider = prompt.closest(".slider-block");
      if (slider === null) throw new Error("completion prompt is not attached to the slider");
      const promptBox = prompt.getBoundingClientRect();
      const sliderBox = slider.getBoundingClientRect();
      return {
        promptTop: promptBox.top,
        promptBottom: promptBox.bottom,
        sliderTop: sliderBox.top,
        sliderBottom: sliderBox.bottom,
      };
    });
    expect(promptPlacement.promptTop).toBeGreaterThanOrEqual(promptPlacement.sliderTop);
    expect(promptPlacement.promptBottom).toBeLessThanOrEqual(promptPlacement.sliderBottom + 1);
    expect(await text(page, "[data-show-result]")).toBe("Reveal the paradox →");

    await page.locator("[data-show-result]").click();
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    expect(await text(page, "[data-reveal]")).toContain("Braess’s paradox");
    expect(await text(page, "[data-reveal]")).toContain("One extra road made the same crowd slower");
    expect(await text(page, "[data-reveal]")).toContain("Shortcut closed 65 min 4,000 drivers split evenly");
    expect(await text(page, "[data-reveal]")).toContain("Shortcut open 80 min The same 4,000 use both narrow roads");
    expect(await text(page, "[data-reveal]")).toContain("Only the shortcut changed");
    expect(await text(page, "[data-best-explanation]")).toContain(
      "best balance was 500 shortcut users at 64.7 minutes",
    );
    expect(await text(page, "[data-best-explanation]")).toContain(
      "shortcut was still 22.5 minutes quicker",
    );
    expect(await text(page, "[data-decision]")).toContain("nobody leaves");
    expect(await page.locator('.driver-dot[data-route="shortcut"]').count()).toBe(80);
    expect(await text(page, ".reveal-summary")).toBe(
      "Every driver followed the route that looked quicker. Together, they made both narrow roads busier.",
    );
    expect(await page.locator("[data-toggle-road]").isVisible()).toBe(true);
    expect(await page.locator("[data-toggle-road]").getAttribute("role")).toBe("switch");
    expect(await page.locator("[data-toggle-road]").getAttribute("aria-checked")).toBe("true");
    expect(await text(page, ".driver-lock")).toBe("Drivers locked 4,000");
    expect(await page.locator("[data-reveal]").evaluate((element) => element === document.activeElement)).toBe(true);
    expect(await page.locator("[data-reveal] > [data-road-control]").count()).toBe(1);
    const revealLayout = await page.evaluate(() => {
      const experiment = document.querySelector<HTMLElement>(".experiment");
      const map = document.querySelector<HTMLElement>(".network-wrap");
      const reveal = document.querySelector<HTMLElement>("[data-reveal]");
      if (experiment === null || map === null || reveal === null) throw new Error("missing result layout");
      const experimentBox = experiment.getBoundingClientRect();
      const mapBox = map.getBoundingClientRect();
      const revealBox = reveal.getBoundingClientRect();
      return {
        experimentBottom: experimentBox.bottom,
        mapBottom: mapBox.bottom,
        revealTop: revealBox.top,
        revealPosition: getComputedStyle(reveal).position,
      };
    });
    expect(revealLayout.revealTop).toBeGreaterThanOrEqual(revealLayout.experimentBottom - 1);
    expect(revealLayout.revealTop).toBeGreaterThanOrEqual(revealLayout.mapBottom - 1);
    expect(revealLayout.revealPosition).toBe("static");
    await noOverflow(page);
    healthy(observed);
    await page.close();
  });

  it("closes and reopens the shortcut as a visible reversal", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    const initialRoadWidth = Number.parseFloat(await page.locator(".road--narrow").first().evaluate((element) => getComputedStyle(element).strokeWidth));
    await setUsers(page, 4_000);
    await page.locator("[data-show-result]").click();
    await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".road--narrow")!).strokeWidth) > 19);
    const crowdedRoadWidth = Number.parseFloat(await page.locator(".road--narrow").first().evaluate((element) => getComputedStyle(element).strokeWidth));
    expect(crowdedRoadWidth).toBeGreaterThan(initialRoadWidth);
    await page.locator("[data-toggle-road]").click();
    expect(await page.locator("body").getAttribute("data-road-closed")).toBe("true");
    expect(await page.locator("[data-toggle-road]").getAttribute("aria-checked")).toBe("false");
    expect(await text(page, "[data-network-state]")).toBe("Closed");
    expect(await page.locator("#shortcut-users").isDisabled()).toBe(true);
    expect(await page.locator("#shortcut-users").inputValue()).toBe("0");
    expect(await text(page, "[data-average-time]")).toBe("65");
    expect(await page.locator("[data-map-proof]").isVisible()).toBe(true);
    expect(await text(page, "[data-map-proof]")).toContain("80 → 65 min");
    expect(await text(page, "[data-map-proof]")).toContain(
      "One road removed. The same 4,000 drivers are now 15 minutes faster.",
    );
    expect(await page.locator("[data-map-proof]").evaluate((element) => element === document.activeElement)).toBe(true);
    await page.waitForFunction(() => document.querySelector("[data-network-wrap]")!.getBoundingClientRect().top >= 0);
    expect(await page.locator('.driver-dot[data-route="top"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-route="bottom"]').count()).toBe(40);
    expect(await page.locator('.driver-dot[data-route="shortcut"]').count()).toBe(0);
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".road--narrow")!).strokeWidth) < 9.01);
    const clearedRoadWidth = Number.parseFloat(await page.locator(".road--narrow").first().evaluate((element) => getComputedStyle(element).strokeWidth));
    expect(clearedRoadWidth).toBeCloseTo(initialRoadWidth, 1);

    await page.locator("[data-toggle-road]").click();
    expect(await page.locator("body").getAttribute("data-road-closed")).toBe("false");
    expect(await page.locator("[data-toggle-road]").getAttribute("aria-checked")).toBe("true");
    expect(await text(page, "[data-network-state]")).toBe("Open");
    expect(await page.locator("#shortcut-users").isEnabled()).toBe(true);
    expect(await page.locator("#shortcut-users").inputValue()).toBe("4000");
    expect(await text(page, "[data-average-time]")).toBe("80");
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    healthy(observed);
    await page.close();
  });

});

describe("phone and keyboard", () => {
  it("fits the marking viewport at the start, middle and reveal", async () => {
    const observed = await open(PHONE);
    const { page } = observed;
    await noOverflow(page);
    await setUsers(page, 2_000);
    await noOverflow(page);
    await setUsers(page, 4_000);
    await noOverflow(page);
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    await page.locator("[data-show-result]").click();
    await noOverflow(page);
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    healthy(observed);
    await page.close();
  });

  it("supports keyboard adjustment without a separate control path", async () => {
    const observed = await open(PHONE);
    const { page } = observed;
    const slider = page.locator("#shortcut-users");
    await slider.focus();
    await page.keyboard.press("End");
    expect(await slider.inputValue()).toBe("4000");
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("shortcut-users");
    await page.locator("[data-show-result]").focus();
    await page.keyboard.press("Enter");
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    await page.locator("[data-toggle-road]").focus();
    await page.keyboard.press("Enter");
    expect(await text(page, "[data-average-time]")).toBe("65");
    expect(await page.locator("[data-map-proof]").evaluate((element) => element === document.activeElement)).toBe(true);
    healthy(observed);
    await page.close();
  });

  it("removes decorative motion when reduced motion is requested", async () => {
    const observed = await open(PHONE, true);
    const { page } = observed;
    await setUsers(page, 4_000);
    expect(await page.locator("#shortcut-users").inputValue()).toBe("4000");
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    await page.locator("[data-show-result]").click();
    const duration = await page.locator("[data-reveal]").evaluate((element) =>
      getComputedStyle(element).animationDuration,
    );
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001);
    healthy(observed);
    await page.close();
  });
});

describe("built artefact", () => {
  it("keeps the complete client payload small", async () => {
    const files = await readdir(join(DIST, "assets"));
    let bytes = 0;
    for (const file of files) {
      if (file.endsWith(".js") || file.endsWith(".css")) {
        bytes += (await stat(join(DIST, "assets", file))).size;
      }
    }
    expect(bytes).toBeLessThan(40_000);
  });
});
