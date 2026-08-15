# One More Road

One More Road is a six-chapter interactive investigation of Braess's paradox. The
visitor traces the original routes, draws and traces a shortcut, predicts a quiet-road
control, stress-tests the same network at peak demand, releases four traffic
waves, constructs a fair comparison and inspects both bottlenecks before the
phenomenon is named.

The traffic is produced by a deterministic, fixed-timestep Intelligent Driver
Model (IDM) simulation with seeded departures and route learning. The page is a
static TypeScript/Vite site; it does not call a server at runtime.

## Result and evidence caveat

The verdict shown on the page comes from a paired headless experiment, not from a
convenient animation frame. The current snapshot reports **331.3 s closed versus
343.8 s open (+3.8%)**. Both conditions use the same frozen configuration, seed and
departure schedule; the connector state is the intervention. At lower demand, the
control reverses sign: **318.6 s versus 310.7 s (-2.5%)**.

Ten target seeds were attempted, but only **8/10 met the usability/equilibrium
gates**. The other two are excluded from the aggregate rather than presented as
settled evidence; the usable-seed mean is +4.2%. The browser animation is one
warm-start live run intended to illustrate gradual rerouting and congestion. Its
checkpoint percentages count post-opening route decisions as they occur; they can
wander and are not the controlled verdict.

## Run locally

Node 24 and pnpm 11.9.0 are pinned in `mise.toml`.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm exec playwright install chromium
mise exec -- pnpm dev
```

Run the full type, build, lint, scientific and browser checks:

```sh
mise exec -- pnpm check
```

Validate `PROCESS.md`, its commit citations and the current reflection name:

```sh
mise exec -- pnpm check:evidence
```

After an intentional experiment or model change, regenerate the checked-in
evidence snapshot, then run the full check again:

```sh
mise exec -- node scripts/snapshot.ts
mise exec -- pnpm check
```

The snapshot command writes `src/experiment/result.generated.ts`; do not hand-edit
that file.

## Architecture

| Area | Responsibility |
| --- | --- |
| `index.html`, `styles.css`, `main.ts` | Accessible page shell, presentation and interaction orchestration |
| `src/story.ts` | Six user-paced chapters and their fifteen narrative states |
| `src/live.ts` | Illustrative fixed-step run, departure-choice measurement and render interpolation |
| `src/sim/` | IDM physics, network, routing and seeded randomness |
| `src/experiment/` | Frozen configurations, paired runs, equilibrium gates, metrics and evidence aggregation |
| `src/experiment/result.generated.ts` | Generated evidence payload imported by the page |
| `src/view/` | Responsive SVG layout, traffic scene and visual annotations |
| `scripts/snapshot.ts` | Recomputes the evidence payload from the headless experiment |
| `spec/` | Scientific, content, accessibility, responsive and real-browser checks |
| `PROCESS.md`, `notes/log.md`, `reflections/` | Cited process evidence and working record |

## Deployment

Expected GitHub Pages URL after a successful public deployment:
[comp4020-agentic-coding-studio.github.io/comp4020-ass1-SharmaKunal14/](https://comp4020-agentic-coding-studio.github.io/comp4020-ass1-SharmaKunal14/)

This address is inferred from the repository remote; it is not a claim that the
deployment is currently live. The Pages workflow publishes `dist/` from `main`
only after the repository is public and the check job succeeds.
