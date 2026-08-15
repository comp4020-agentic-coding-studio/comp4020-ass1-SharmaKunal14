import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TARGET, networkOf } from "../src/experiment/config.ts";
import type { LiveRun } from "../src/live.ts";
import type { Vehicle } from "../src/sim/engine.ts";
import type { LinkId, RouteId } from "../src/sim/network.ts";
import { VIEWBOX } from "../src/view/layout.ts";
import { Scene } from "../src/view/scene.ts";

const network = networkOf(TARGET);
let previousDocument: PropertyDescriptor | undefined;

beforeEach(() => {
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const dom = new JSDOM("<main></main>");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
});

afterEach(() => {
  if (previousDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
    return;
  }
  Object.defineProperty(globalThis, "document", previousDocument);
});

function vehicle(id: number, routeId: RouteId, link: LinkId): Vehicle {
  const leg = network.routes[routeId].indexOf(link);
  if (leg < 0) throw new Error(`${link} is not on ${routeId}`);
  return {
    id,
    routeId,
    links: network.routes[routeId],
    leg,
    prevLeg: leg,
    pos: network.links[link].length / 2,
    prevPos: network.links[link].length / 2 - 1,
    vel: network.links[link].speedLimit,
    v0Factor: 1,
    TFactor: 1,
    departTime: 0,
    legEnteredAt: 0,
    heldAtNode: false,
  };
}

function harness(): {
  readonly host: HTMLElement;
  readonly scene: Scene;
  readonly onLink: Record<LinkId, Vehicle[]>;
  readonly run: Pick<LiveRun, "congestionOf" | "vehiclesOn">;
} {
  const host = document.createElement("main");
  const scene = new Scene(host);
  const svg = host.querySelector("svg");
  if (svg === null) throw new Error("scene did not create an SVG");
  // jsdom does not implement SVGAnimatedRect; layout uses it only to keep text
  // inside the real browser's viewBox.
  Object.defineProperty(svg, "viewBox", {
    configurable: true,
    value: { baseVal: VIEWBOX.wide },
  });
  scene.setLayout(
    "wide",
    {
      streetLength: network.links.SA.length,
      throatStart: network.links.SA.bottleneck?.start ?? 0,
    },
    network,
  );

  const onLink: Record<LinkId, Vehicle[]> = { SA: [], AT: [], SB: [], BT: [], AB: [] };
  const run: Pick<LiveRun, "congestionOf" | "vehiclesOn"> = {
    congestionOf: () => 1,
    vehiclesOn: (link) => onLink[link],
  };
  return { host, scene, onLink, run };
}

describe("route-distinguishable vehicle rendering", () => {
  it("keeps the shortcut marker and SVG identity as a driver crosses links", () => {
    const { host, scene, onLink, run } = harness();
    const driver = vehicle(7, "shortcut", "SA");
    onLink.SA.push(driver);

    scene.render(run, network);

    const first = host.querySelector<SVGCircleElement>(".vehicle--shortcut");
    expect(first).not.toBeNull();
    expect(Number(first?.getAttribute("r"))).toBeGreaterThan(4.6);

    onLink.SA.length = 0;
    driver.leg = 1;
    driver.prevLeg = 0;
    driver.pos = network.links.AB.length / 2;
    onLink.AB.push(driver);
    scene.render(run, network);

    const onConnector = host.querySelector<SVGCircleElement>(".vehicle--shortcut");
    expect(onConnector).toBe(first);
    expect(onConnector?.classList.contains("vehicle")).toBe(true);
  });

  it("clears shortcut-only structure when a pooled circle is reused", () => {
    const { host, scene, onLink, run } = harness();
    onLink.AB.push(vehicle(11, "shortcut", "AB"));
    scene.render(run, network);
    const shortcutDot = host.querySelector<SVGCircleElement>(".vehicle--shortcut");
    expect(shortcutDot).not.toBeNull();

    onLink.AB.length = 0;
    scene.render(run, network);
    expect(shortcutDot?.style.display).toBe("none");

    onLink.AT.push(vehicle(12, "north", "AT"));
    scene.render(run, network);
    const reused = host.querySelector<SVGCircleElement>(".vehicle");

    expect(reused).toBe(shortcutDot);
    expect(reused?.classList.contains("vehicle--shortcut")).toBe(false);
    expect(reused?.getAttribute("r")).toBe("4.6");
    expect(reused?.style.display).toBe("");
  });
});
