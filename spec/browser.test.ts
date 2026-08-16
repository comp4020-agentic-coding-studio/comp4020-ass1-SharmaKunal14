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
  it("shows the rules and initial calculation before interaction", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    expect(await page.locator("button").count()).toBe(0);
    expect(await page.locator('input[type="range"]').count()).toBe(1);
    expect(await text(page, "[data-old-time]")).toBe("65");
    expect(await text(page, "[data-shortcut-time]")).toBe("40");
    expect(await text(page, "[data-average-time]")).toBe("65");
    expect(await page.locator("[data-reveal]").isHidden()).toBe(true);
    await noOverflow(page);
    healthy(observed);
    await page.close();
  });

  it("updates every visible number from the same slider value", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 2_000);
    expect(await text(page, "[data-old-time]")).toBe("75");
    expect(await text(page, "[data-shortcut-time]")).toBe("60");
    expect(await text(page, "[data-average-time]")).toBe("67.5");
    expect(await text(page, "[data-narrow-math]")).toBe("(4,000 + 2,000) ÷ 2 = 3,000");
    expect(await text(page, "[data-average-math]")).toBe("(2,000 × 75 + 2,000 × 60) ÷ 4,000 = 67.5 min");
    expect(await text(page, "[data-decision]")).toContain("Switching right now looks 15 minutes better");
    healthy(observed);
    await page.close();
  });

  it("reveals the paradox only when every driver has switched", async () => {
    const observed = await open(DESKTOP);
    const { page } = observed;
    await setUsers(page, 4_000);
    expect(await text(page, "[data-old-time]")).toBe("85");
    expect(await text(page, "[data-shortcut-time]")).toBe("80");
    expect(await text(page, "[data-average-time]")).toBe("80");
    expect(await text(page, "[data-average-change]")).toBe("15 min slower than without the shortcut");
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    expect(await text(page, "[data-reveal]")).toContain("Braess’s paradox");
    expect(await text(page, "[data-reveal]")).toContain("Stay: 80 min · Leave alone: 85 min");
    expect(await text(page, "[data-reveal]")).toContain("Before road: 65 min · After choices: 80 min");
    expect(await text(page, "[data-decision]")).toContain("nobody leaves");
    await noOverflow(page);
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
    expect(await page.locator("[data-reveal]").isVisible()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("shortcut-users");
    healthy(observed);
    await page.close();
  });

  it("removes decorative motion when reduced motion is requested", async () => {
    const observed = await open(PHONE, true);
    const { page } = observed;
    await setUsers(page, 4_000);
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
