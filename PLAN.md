# One More Road — implementation plan

Checkpoint 0. Written before any implementation code. This is a working
document: decisions here are meant to be challenged, and the ones that change
during the build should change here too.

## 0. What I read

- Assignment 1 brief and rubric: course API `/api/assessments/assignment-1.json`
  (spec lines, weights, key dates).
- Marking environment: `/api/topics/assessment.json` — latest stable Chrome,
  1920×1080 and 390×844, both full marking environments.
- Week 4 retro crit: `/api/crits/03-a1-retro.json` — reads
  `reflections/assignment-1.md`; nothing to write twice.
- This starter, completely: `CLAUDE.md`, `PROCESS.md`, `spec/*`,
  `scripts/check-evidence.ts`, `.github/workflows/checks.yml`, `vite.config.ts`,
  `package.json`, `.githooks/pre-commit`. One commit: `fa0d292 Initial commit`.
- My own accumulated harness in `comp4020-crit2-SharmaKunal14/CLAUDE.md`
  (233 lines, 12 commits).

## 1. Hard constraints

| Constraint | Value |
| --- | --- |
| Due | **noon Mon 17 Aug 2026** Canberra. No late submissions. |
| Time left at CP0 | **~58 h** |
| Weights | Legibility of process **45%** · Working deployed artefact **20%** · Response to brief **35%** |
| Marking viewports | 1920×1080 and 390×844, both in full |
| Artefact HD band | "holds up under use it wasn't designed for: the keyboard, a resize mid-interaction, a slow connection" |
| `PROCESS.md` | 400–600 words, **three or four** moments, no more |
| Reflection | `reflections/assignment-1.md` exactly |
| CI | gated on the repo being public; nothing runs until `/ship` |
| Runtime | `mise exec --` for everything (Node 24; bare shell node is 22.14) |

The brief's own framing: *"the marks lean toward how legibly you direct the work
rather than how polished the artefact ends up — a rough-but-legible first
prototype scores well here."*

## 2. Strategy, given the rubric

The rigour programme in the build brief is right, but the reason it is right is
worth stating precisely, because it changes what "done" means:

- Simulation rigour does **not** buy artefact marks. The artefact criterion is
  20% and its HD band is entirely about robustness under unintended use.
- Simulation rigour buys **process** marks (45%) only if it is legible as
  *direction*: invariants written down, failures diagnosed at the harness level,
  approaches thrown away. A correct simulation with no visible harness scores in
  the D–Cr band ("attempt, accept, repeat").
- Simulation rigour buys **response** marks (35%) by making the point of view
  credible rather than asserted.

So three standing consequences for how I sequence the work:

1. **Invariants before model.** Write the conservation / determinism / fairness /
   free-flow checks first, against an empty engine. Then the model's real
   failures get caught by checks rather than by me squinting at numbers — which
   is both the better process and the evidence the HD band asks for.
2. **Robustness is a first-class deliverable, not polish.** Keyboard, resize
   mid-run, and payload budget get their own checks, not a final once-over.
3. **Ship early, iterate deployed.** Flip public Saturday evening so CI and
   Pages are verified with a day of slack, not at the deadline.

## 3. Adversarial reading of the brief

### Requirements we could accidentally miss

- `PROCESS.md` word range (400–600) and moment count (**three or four** — more is
  a violation, not extra credit).
- Reflection filename is exact; `check:evidence` resolves it against the live API.
- Delete `spec/starter.test.ts` when the starter page goes (it is designed to
  fail then, and the failure message says so).
- Every page needs `<nav>`, one `<h1>`, `lang`, title, viewport meta — the shipped
  invariants run against `dist/`, not source.
- `pnpm dlx linkinator ./dist` runs in CI only; run it locally before shipping.
- The pre-commit hook blocks API-key-shaped strings — don't commit fixtures that
  look like keys.

### Machine-checkable vs. human judgement

Machine-checkable, so it belongs in `spec/`: vehicle conservation, determinism
under seed, baseline/treatment config equality, the Braess outcome in the target
config, the *absence* of it in the control config, steady state, no negative
velocities, free-flow sanity, render-independence of sim state, button semantics
and keyboard activation, no horizontal overflow at 390 px, payload budget,
pre-decision word budget.

Human judgement, so it belongs in the crit and not in a test: whether the
interaction actually explains, whether the pacing lands, whether the copy earns
its place, whether the idea has a point of view.

### Assumptions I am making, and where they could be wrong

1. **That a visitor will accept a synthetic network.** I think yes, if the page
   says so plainly and early. A fake Canberra would be worse on every axis.
2. **That ~2 clicks is enough interaction.** The spec says "the visitor does
   something that changes what they see". Build/Close qualifies. But two clicks
   over two minutes is thin, so I add *one* inspection affordance (route
   highlight on hover/focus) that does explanatory work without becoming a
   second mechanic. Anything more is scope creep.
3. **That the effect will be ~15–25%, not dramatic.** For affine latencies the
   worst case is 4/3 (price of anarchy). The classic textbook instance is
   65→80, i.e. +23%. If I aim for a doubling I will end up cheating. The
   headline has to work at +20%: `5:12 → 6:15`, not `10 min → 30 min`.
4. **That IDM is the right model.** Justified in §5, but see the crux in §5.3 —
   my first instinct about how congestion arises was wrong, and that changes the
   design.

### Where this could become over-scoped

Ranked by how tempting each will be at 3 a.m.: a demand slider "to show the
control case"; a second network; a queue-length chart per link; vehicle
acceleration profiles on hover; an animated equation; a "step time" control; a
share-your-result card. All rejected in §4.

### What could make a marker call the simulation contrived

1. Latency functions instead of physics. Avoided: there is no
   `time = f(flow)` anywhere; travel time is measured from vehicle trajectories.
2. Congestion assigned to the connector. Avoided: the connector is the
   *fastest, emptiest* link in the model. The harm happens on links that existed
   before it.
3. The paradox being an artefact of the node model. **This is the real risk.**
   If vehicles brake spuriously when crossing a node, we manufacture bottlenecks
   at exactly the places the connector adds. Mitigated by a free-flow test: one
   vehicle traversing a three-link route must take `Σ length/v₀` within a tight
   tolerance, with no deceleration event at any node.
4. Measuring a transient instead of an equilibrium. If demand exceeds a link's
   capacity, the queue grows without bound and "worse" just means "I waited
   longer before screenshotting". Mitigated by a steady-state check (§6).
5. Survivorship bias in the metric: averaging completed trips while the slowest
   vehicles are still queued. Mitigated by cohort-based measurement (§6).
6. Route choice rigged toward the connector. Mitigated: drivers only ever see
   their own experienced travel times; the same route-choice code runs in both
   configs; with the connector closed, learned shares must match the symmetric
   equilibrium.
7. A knife-edge parameter set. Mitigated by a bounded sensitivity sweep and
   multiple seeds (§6). If it *is* brittle, that goes in the model note and in
   my report to you, not under the rug.

### What could make it technically impressive but conceptually weak

If the visitor watches a number change and has to be *told* why. The cure is
that the reveal is visual and structural: after the connector opens, the two
short links are visibly carrying everyone, and the two big parkways are visibly
empty. The sentence only names what the picture already shows.

## 4. Scope contract

**The one idea.** More capacity does not always make a shared system better,
because it changes how individually rational people choose.

**The one mechanic.** A single road toggles between built and not built. Close is
the same mechanic run backwards — it completes the experiment, it is not a second
idea.

**In scope**

- One synthetic four-node network, fixed.
- Vehicles visibly moving, queues visibly forming.
- Live average-journey-time readout, plus the pre-build baseline held for contrast.
- `BUILD THE ROAD` → adaptation → worse equilibrium → causal reveal →
  `CLOSE THE ROAD` → recovery → the name and a short explanation.
- Route highlight on hover/focus (inspection of the existing object).
- One time-series of average journey time, with markers where the road opened
  and closed. **This is the measurement, not a dashboard widget** — it is the
  single cheapest thing that makes "it got better first, then worse" legible,
  and without it that claim is only in the copy. *Decision needed (§11).*
- A "how this works" disclosure.

**Out of scope — decided now, so it is not relitigated later**

Demand/speed/lane sliders · a second network · a network editor · traffic lights
· pedestrians · lane changing · multi-lane physics · real GIS data · any claim
about a real city · a backend · charts beyond the one above · a derivation ·
scroll-driven sections · a hero section · icons · more than two buttons.

## 5. The model

### 5.1 Network

Classic Braess topology, four nodes, drawn so the geometry carries the argument.

```
                 Riverside (A)
              ↗       │       ↘
   short, narrow      │ connector    Northern Parkway
   (Eastgate Rd)      │ (new)        long, wide, free-flowing
Eastgate (S)          ▼                          Central (T)
   Southern Parkway   │              short, narrow
   long, wide         │              (Millbrook St)
              ↘  Millbrook (B)  ↗
```

- `S→A` and `B→T`: **short, low-capacity** streets. Quick when empty, choke under
  load.
- `S→B` and `A→T`: **long, high-capacity** parkways. Slow because they are long,
  but insensitive to volume.
- `A→B`: the proposed connector. Short and, because almost nobody is on it,
  always fast. It is never the thing that gets congested.

Without the connector, a commuter picks north (short-then-long) or south
(long-then-short). With it, `S→A→B→T` uses *both* short streets and skips both
parkways — geometrically the shortest path, and the trap.

Coordinates are normalised (0–1) and rendered through an SVG `viewBox`. Physics
is in metres and seconds and never sees a pixel.

### 5.2 Car-following: IDM

Intelligent Driver Model, from the primary source:

> Treiber, M., Hennecke, A., & Helbing, D. (2000). Congested traffic states in
> empirical observations and microscopic simulations. *Physical Review E*, 62(2),
> 1805–1824. doi:10.1103/PhysRevE.62.1805 (preprint arXiv:cond-mat/0002177)

Chosen over the alternatives on reasons, not familiarity:

| Model | Why not |
| --- | --- |
| Nagel–Schreckenberg CA | Stochastic braking is in the *physics*, cells make motion jerky, harder to state a clean determinism claim. |
| Optimal-velocity (Bando) | The source paper itself notes it produces unrealistic accelerations and is not collision-free. |
| Point-queue / link transmission | No individual vehicle physics, so nothing to watch and nothing physically interpretable. |

IDM wins here because it is deterministic (all randomness stays in *who departs
when* and *which driver is which*), collision-free by construction, smooth enough
to animate, cheap enough for a phone, and every parameter has a physical reading
— which is exactly the interpretability the build brief asks for.

Table I of the paper, verbatim, as the calibration anchor:

| Parameter | Value |
| --- | --- |
| Desired velocity v₀ | 120 km/h |
| Safe time headway T | 1.6 s |
| Maximum acceleration a | 0.73 m/s² |
| Desired deceleration b | 1.67 m/s² |
| Acceleration exponent δ | 4 |
| Jam distance s₀ | 2 m |
| Jam distance s₁ | 0 m |
| Vehicle length l | 5 m |

Our v₀ is urban rather than freeway, but a, b, δ, s₀, l stay at the paper's
values and any departure gets recorded in the model note.

### 5.3 The crux: where congestion actually comes from

My first design assumed a short link congests because more cars are on it. **That
is wrong for a deterministic car-following model.** Below capacity, with evenly
spaced departures, IDM vehicles keep free-flow speed and travel time equals
`length / v₀`; above capacity the queue grows without bound. The latency curve is
a step, not the smooth rising curve Braess needs. Building on the wrong version
would have produced either no effect at all or an unbounded queue I could have
mistaken for one.

The honest fix is the one real traffic uses: **arrivals are not evenly spaced and
drivers are not identical.** With seeded exponential inter-departure times and
mild per-driver heterogeneity in v₀ and T, a link's travel time rises smoothly
and steeply as flow approaches capacity — ordinary queueing, and the empirical
reason volume–delay curves look the way they do. Both ingredients are realistic
in their own right, both stay deterministic under a seed, and neither is a
latency function.

Consequences I am accepting deliberately:

- The effect is **statistical**, so it must be claimed across seeds, not one run.
- The measurement window needs a warm-up and enough completions to average.
- Seed-to-seed spread must be smaller than the effect, and that is a check.

### 5.4 Link capacity, without lane changing

Capacity has to differ between the streets and the parkways, and single-lane IDM
capacity is bounded by roughly `1/T`. The paper supplies the device:

> "Changes of the freeway capacity were described by a variation of the safe time
> headway T."

and reports that a local parameter-induced capacity drop behaves essentially like
an on-ramp bottleneck. So **capacity is set per link by the headway drivers keep
on it** — larger T on the narrow streets, smaller on the parkways. Physically
readable ("drivers leave bigger gaps on the tight street"), sanctioned by the
primary source, and it removes any need for multi-lane physics or lane changing.

From the triangular limit `Qc = v₀/(v₀T + s₀ + l)`:

| Link | v₀ | T | capacity | free-flow time |
| --- | --- | --- | --- | --- |
| Streets (`S→A`, `B→T`) | ~60 km/h | ~2.6 s | ~1200 veh/h | ~110 s |
| Parkways (`S→B`, `A→T`) | ~100 km/h | ~1.4 s | ~2200 veh/h | ~200 s |
| Connector (`A→B`) | ~60 km/h | ~2.6 s | ~1200 veh/h | ~36 s |

Design targets, to be calibrated in CP1 and recorded once measured.

Sizing check. Demand near ~1000 veh/h loads a street to ~85% of capacity when the
connector is open, and ~42% when it is closed:

- closed: `110 + 200 ≈ 310 s ≈ 5:10`
- open, all on `S→A→B→T`: `2 × ~160 + 36 ≈ 356 s ≈ 5:56`

That is the ~15–25% we should expect, and it keeps demand below every link's
capacity in **both** configurations — which is what stops the "after" case from
being an unbounded queue.

### 5.5 Nodes

A vehicle enters its next link only when the gap to the last vehicle on that link
is at least the IDM minimum; otherwise it waits, and vehicles behind it queue on
the incoming link. Competing streams are served in arrival order — deterministic,
and a defensible reading of gap acceptance.

The correctness trap: a vehicle approaching a node must perceive its leader
*across* the node, on the next link of its own route. Without that, everyone
brakes at every node, node delay scales with node count, and the connector — which
adds a node crossing — looks harmful for reasons that have nothing to do with
Braess. Hence the free-flow test in §7.

### 5.6 Route choice

At departure, a driver picks among the routes currently available using a logit
rule over its own *learned* estimates:

```
P(r) ∝ exp(−θ · estimate[r])
```

Estimates update by exponential smoothing from the experienced travel times that
arriving drivers report. A newly opened route starts at its free-flow time — the
optimistic prior a real driver has for a road they have only looked at.

This is what makes the narrative emerge instead of being scripted: the connector
looks fast, a few try it, they report fast times, more switch, the streets load
up, reported times rise, and the system settles worse than it started. The
"promising at first" beat is a property of learning, not a timeline in the code.

Risks: logit day-to-day learning can oscillate rather than settle, and θ trades
off responsiveness against noise. Convergence is a check (§7), not an assumption.
Sources to verify before they appear on the page: Wardrop (1952) for the
equilibrium notion, Daganzo & Sheffi (1977) for stochastic user equilibrium.

### 5.7 Time and honesty about scale

Simulated time runs faster than wall-clock (~8×, calibrate for legibility) so the
arc fits inside a visitor's minute. Disclosed on the page. Vehicles on screen are
the actual simulated vehicles — no scaling factor, nothing to fake. Demand is
stated in veh/h.

## 6. Experiment design

One frozen config object is the single source of truth. Baseline and treatment
are the *same* config; the only difference is one boolean on the connector edge.
There is no second scenario object to drift.

```
ExperimentConfig  (frozen: demand, seed, driver population, departure
                   schedule, link parameters, dt, θ, smoothing, horizon)
        │
        ├── run(config, { connector: false })
        └── run(config, { connector: true })
```

**Metric.** Mean door-to-door travel time of the departure cohort that leaves
inside a measurement window, after a warm-up, counted on arrival. Cohort-based
rather than arrival-based, so a growing queue cannot flatter the average by
excluding its own victims.

**Steady state.** Reported only if: mean over the last quarter of the window is
within tolerance of the mean over the second half, *and* the number of vehicles
in the network is stable, *and* no link's queue is growing monotonically. If any
fails, the run is inconclusive and says so rather than producing a number.

**Reproducibility.** Same config + seed → identical results, bit-for-bit for the
same code path.

**Robustness.** N seeds; report mean and spread; the effect must exceed the
spread. Bounded sensitivity: ±20% on demand, T, θ, and link lengths, one at a
time. I am looking for a *region*, not a point. If the sign flips inside ±20%,
you hear about it.

**Control config.** Same engine, same topology, lower demand → the connector
*helps*, materially. This is the load-bearing evidence that `new road → worse` is
not a rule in the code. It lives in the test harness; whether one sentence of it
reaches the page is §11.

## 7. Harness

Every check below is here because a specific way of being wrong would otherwise
ship silently.

| Check | Failure mode it protects against |
| --- | --- |
| Vehicle conservation each step | Vehicles silently dropped at nodes or double-counted, inflating or deflating throughput |
| Determinism under seed | "Rerun until the paradox appears" |
| Config identity (deep compare, connector flag excluded) | An unfair before/after — the thing the build brief most wants prevented |
| Braess in target config | The claim the page makes |
| **No** Braess in control config | The engine hard-coding the outcome |
| Steady state / bounded queues | Measuring a transient and calling it an equilibrium |
| Cohort metric excludes nobody silently | Survivorship bias |
| Free-flow single vehicle over a 3-link route ≈ Σ length/v₀ | Spurious node braking manufacturing the effect |
| v ≥ 0, position within link, valid route transitions | Physics quietly broken while numbers still look plausible |
| Sim state identical across viewBox changes mid-run | Rendering leaking into physics |
| Fixed-dt stepping, never rAF delta | Frame rate changing the experiment |
| Build/Close reachable by Tab, activated by Enter and Space, focus visible | The keyboard half of the artefact HD band |
| No horizontal overflow at 390 px (real browser, iframe measurement) | The phone viewport, which is a full marking environment |
| `dist/` payload budget | The slow-connection half of the artefact HD band |
| Pre-decision copy under a word budget | Drift back into an essay with an animation attached |
| Seed spread < effect size | A result that is really noise |

**Not testing**, on purpose: DOM shape, element counts, call counts, exact
numeric outputs of the model (they change legitimately under calibration —
the *invariants* are asserted instead), or anything that would have to be edited
every time the model improves.

Reduced motion: `prefers-reduced-motion` removes decorative transitions and
interpolation. It does **not** stop the simulation, because the simulation is the
explanation — the state readout, the queues and the time series still carry the
argument.

Accessibility: the vehicle layer is `aria-hidden`; meaningful state changes go
through a polite live region. Two semantic `<button>`s. Colour is never the only
cue — road load also reads as stroke weight and queue length.

## 8. Architecture

```
src/sim/     idm.ts  network.ts  vehicle.ts  node.ts  routing.ts  rng.ts
             engine.ts        — pure, no DOM, fixed dt
src/experiment/  config.ts  run.ts  metrics.ts
                              — headless, returns numbers
src/view/    network-svg.ts  vehicles.ts  readout.ts  timeline.ts
                              — reads state, never writes it
src/app.ts   wiring, narrative state machine
spec/        invariants + the checks in §7
```

Two rules with teeth, both going into `CLAUDE.md`: nothing under `src/sim/` or
`src/experiment/` may import from `src/view/` or touch `document`; and the engine
advances only in fixed `dt` steps driven by an accumulator, never by a frame
delta.

**Stack.** Stay on the shipped Vite + TypeScript template. Crit 2 moved to Astro
for a five-page content site, which was right then; a single-page simulation with
one HTML file and heavy TypeScript gets nothing from a content framework and
would import the `base`-path trap that `base: "./"` already solves here. Carry
the crit-2 `CLAUDE.md` forward — the runtime trap, the `min-width: 0` overflow
trap, the `toSorted`/`lib` mismatch, the "no live-URL assertion in `spec/`" rule
all still apply.

**Renderer.** SVG first: normalised geometry, semantic and focusable roads,
responsive for free. ~100–150 vehicles is within SVG's range, but this gets
*measured* at 390×844 on a real device profile before it is believed. If it
misses frame budget, vehicles move to a `<canvas>` layer over the SVG network and
the reason gets written down. Decided by measurement, not preference.

## 9. Risks, and what I do about each

| Risk | Response | Kill criterion |
| --- | --- | --- |
| Effect will not emerge at any sane parameters | Calibrate along the §5.4 sizing argument; the condition `2·t_street(D) − t_street(D/2) > t_parkway − t_connector` tells me which knob to turn and why | Not demonstrated headlessly by **CP1 + 6 h** → I report and we simplify |
| Effect is brittle | Bounded sweep; report honestly | Sign flips within ±10% → tell you, do not ship the claim as-is |
| Learning oscillates | Tune θ and smoothing; convergence check | Cannot settle → fall back to a slower adaptation rate and say so |
| Node model manufactures congestion | Free-flow test written *before* the node code | Test cannot be made to pass → the node model is wrong, not the test |
| Phone frame rate | Measure early; canvas fallback ready | — |
| Time | Fallback ladder below | — |
| Only 58 h of history for a 45% process criterion | Commit granularly and truthfully as the work happens; keep a working log so `PROCESS.md` is curated from a real record | — |

**Fallback ladder** (each step still answers the brief):

1. Full plan.
2. Drop the time series; keep before/after numbers and the visual reveal.
3. Drop route highlighting.
4. Reduce to a single seed with the sensitivity sweep reported in the model note
   rather than run in CI.
5. Keep IDM but shorten the network so calibration is faster.

Never dropped: the controlled experiment, the control config, conservation and
determinism checks, both viewports, keyboard, the deploy.

## 10. Schedule

| When | Checkpoint |
| --- | --- |
| Sat early | CP0: this plan → **your review** |
| Sat | Harness skeleton + `CLAUDE.md` carried forward and extended; then sim core; **CP1 numerical evidence → report to you** |
| Sat evening | Smallest interactive slice; **flip public early** so CI and Pages are proven with slack |
| Sun morning | CP2: full narrative arc, reveal, close, model note |
| Sun afternoon | CP3: both viewports, resize mid-run, keyboard, reduced motion, payload, deployed verification |
| Sun evening | `PROCESS.md`, `reflections/assignment-1.md`, final deploy |
| Mon morning | CP4 adversarial marker review; buffer only |

Nothing lands on Monday that isn't already deployed and green on Sunday night.

## 11. Decisions I need from you

1. **The time series** — one small line chart of average journey time with
   open/close markers. I recommend **yes**: it is the evidence for "better
   first, then worse", and without it that beat exists only in copy. It is also
   the most defensible single chart in the project. Risk: it edges toward
   dashboard.
2. **Playwright** for the three real-browser facts (overflow at both viewports,
   Tab/Enter/Space, resize mid-run). I recommend **yes, time-boxed after MVP** —
   it is direct evidence for the artefact band *and* strong harness evidence.
   Cost: ~1–2 h and CI time. jsdom cannot do layout, so without it those three
   are verified by me looking rather than by a check.
3. **"Your car"** — tag one vehicle, show its trip time. Makes the average
   concrete and costs almost nothing. I lean **yes but last**; it is genuinely
   optional.
4. **The control config on the page** — one sentence with a real number from the
   harness ("at 700 veh/h the same connector cuts the average commute by X%"),
   no slider. I recommend **yes**: it is what turns "roads bad" into the honest
   conditional lesson, and it is the cheapest possible scientific modesty.
5. **Title** — `One More Road` vs `The Road That Made Traffic Worse`. I
   recommend **One More Road**: the alternative spoils the outcome in the tab
   title before the visitor has decided anything.
