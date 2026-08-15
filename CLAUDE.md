# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
## What the sensors in `spec/` cannot see

`spec/*.test.ts` catches *declared* fixed widths and similar static-markup
facts. It cannot catch **intrinsic** overflow: a flex/grid item whose content
can't wrap (`white-space: nowrap`, a long URL, a wide table) inherits a
default `min-width: auto`, which resolves to that content's min-content width
--- so the child silently sets the track's minimum, the track grows past the
viewport, and the page scrolls sideways at 390px even though no rule in the
CSS names a fixed width. `overflow: hidden` on the child hides the symptom
without fixing it, and every static assertion stays green throughout.

So: any grid or flex child that can contain nowrap content, a long URL, or a
table needs an explicit `min-width: 0`.

The same trap has a grid-track variant that isn't about items at all: a bare
`max-content` track in `grid-template-columns` sizes to the widest single-line
content across every row, not just the current viewport's rows --- so a
two-column `dl` with short terms overflows the moment one row's term is long
(a full FAQ question, say), even with `min-width: 0` on every child. Fix it at
the track, not the child: `minmax(0, max-content)` lets the track shrink under
space pressure instead of forcing the page to fit its longest single line.

Before shipping, measure it rather than eyeballing it. A real narrow viewport
is needed, because `resize_window` on this setup does not change `innerWidth`
--- render the page in a 390px iframe instead and read `scrollWidth`:

```js
const f = document.createElement("iframe");
f.src = "/";
f.setAttribute("width", "390");
f.setAttribute("height", "844");
document.body.append(f);
await new Promise((r) => f.addEventListener("load", r, { once: true }));
const d = f.contentDocument;
d.documentElement.scrollWidth > f.contentWindow.innerWidth; // must be false
```

Run it against every page, not just the home page.

## This machine's runtime

`mise.toml` pins Node 24, and this shell's bare `node` is 22.14. Node 22 cannot
execute a `.ts` file, so `pnpm check:evidence` --- which runs
`node scripts/check-evidence.ts` --- dies with
`ERR_UNKNOWN_FILE_EXTENSION` for reasons that have nothing to do with the work,
and two of the template's own tests in `scripts/check-evidence.test.ts` fail
with it too.

Run everything through the pinned runtime: `mise exec -- pnpm check`,
`mise exec -- pnpm check:evidence`. If a check fails, confirm the runtime
before believing the failure. CI uses `mise.toml`, so CI is unaffected either
way.

One failure is expected until `PROCESS.md` and `reflections/assignment-1.md` are
real: `check:evidence`. Don't put a live-URL assertion in `spec/*.test.ts`
itself — that suite runs inside CI's `check` job, which gates `deploy`, so a
check for the live site would never be able to pass on the push that first
ships it. Verify the deployed URL with a one-off `curl`, not a spec test.

One stack fact worth remembering: `tsconfig.json` declares `lib: ["ES2022", …]`
even though the runtime is Node 24, so ES2023 array methods like `toSorted`
fail `pnpm typecheck` in `spec/*.ts`. Use `[...xs].sort()`.


## Assignment 1: stack decision

Staying on the template's **Vite + plain TypeScript**, deliberately, after Crit
2 moved to Astro. Astro earned its place for a five-page content site; this is
one page whose weight is all TypeScript, so a content framework adds a build
layer and buys nothing. It would also reintroduce the `base`-path trap that this
template's `base: "./"` already solves — the one thing in a swap that looks fine
locally and 404s on the deployed URL.

## Assignment 1: what this prototype is, and what it must stay

**One More Road** — an interactive explainer of Braess's paradox. The visitor
sees a small synthetic road network with a visible average commute, is offered a
new connector, and builds it. Drivers gradually re-route, the shared streets
choke, and the average commute settles *worse* than before. Then they can close
the road again and watch it recover. Only then is the paradox named.

**One idea, one mechanic.** The mechanic is a single road toggling between built
and not built. `CLOSE THE ROAD` is that same mechanic run backwards — it
completes the experiment; it is not a second idea. Route highlighting on
hover/focus is inspection of an object already on screen, not a mechanic.

Before adding anything, the question is *does this make the visitor understand
the central idea more strongly?* If not, delete it. Prefer deleting UI over
adding an explanatory control. There is no demand slider, no second network, no
network editor, no traffic lights, no lane changing, no chart beyond the one
time-series of average journey time, and no claim about any real city.

## Assignment 1: rules the simulation must not break

These exist because each one is a way of being wrong that would otherwise ship
looking perfectly plausible.

- **Never hard-code the outcome.** There is no `time = f(flow)` latency
  function, and no branch anywhere that reads "if the connector is open". Travel
  time is only ever *measured* from vehicle trajectories. The connector is the
  fastest, emptiest link in the model; the harm happens on links that existed
  before it.
- **The control configuration is load-bearing.** The same engine must produce a
  configuration where the connector *helps*. If that test ever goes red, the
  engine has started hard-coding the answer — fix the engine, never the test.
- **One frozen config, one boolean apart.** Baseline and treatment share the
  same `ExperimentConfig` object; the only permitted difference is whether the
  connector edge exists. Never build two scenario objects that are meant to
  match — they drift. A check deep-compares them.
- **Physics never sees a pixel.** Nothing under `src/sim/` or `src/experiment/`
  may import from `src/view/` or touch `document`, `window`, or any dimension.
  Positions are metres, time is seconds, geometry is normalised. Resizing must
  not be able to change a result.
- **Fixed timestep only.** The engine advances in fixed `dt` steps driven by an
  accumulator. Never integrate with a `requestAnimationFrame` delta: that makes
  the experiment a function of frame rate.
- **All randomness comes from the seeded stream, drawn once.** Departure times,
  driver parameters and each driver's route-choice draw are generated *before*
  the run from `config.seed`, so both configs get a literally identical driver
  population. `Math.random()` is banned outside tests.
- **A result with a growing queue is not a result.** Report a number only if the
  run reached steady state and no link's queue is growing monotonically.
  Otherwise report "inconclusive". Demand must sit below every link's capacity
  in *both* configurations.
- **Measure cohorts, not arrivals.** Average over the drivers who *departed*
  inside the measurement window, counted when they arrive. Averaging whoever
  happened to finish lets a growing queue flatter its own average by excluding
  its victims.
- **The effect is statistical.** It is claimed across seeds with the spread
  reported, never from a single run, and never from a run chosen because it
  looked good.

## Assignment 1: claims we are allowed to make

The network is synthetic and the numbers are a controlled demonstration, not a
measurement of anywhere. "Building roads makes traffic worse" is false and we
never say it. What is true, and what the page says, is closer to: *under
particular network, demand and routing conditions, adding a connection can
change selfish route choices so that the resulting equilibrium is worse for
everyone.* The control configuration is the honest other half of that sentence,
and it earns its one line on the page.

Every simplification gets disclosed in the model note, with the model cited to
its primary source.

## Assignment 1: verification that actually counts

- Run everything through `mise exec --`.
- The rendered page at **390×844** is a full marking environment, and the
  simulation running there is part of what has to work — measure frame
  behaviour at phone size with the real vehicle count, don't assume it.
- **Resize mid-interaction** is explicitly in the artefact band. Test it while
  the simulation is running, not while it is idle.
- **Keyboard**: both buttons reachable by Tab, activated by Enter *and* Space,
  with visible focus. State changes are announced through a live region, because
  a screen reader user cannot see the queue grow.
- **Reduced motion** removes decorative transitions and interpolation. It does
  **not** stop the simulation — the simulation is the explanation. The readout,
  the queues and the time series still have to carry the argument.
- Hundreds of SVG vehicles must never be traversable by a screen reader: the
  vehicle layer is `aria-hidden`, and the meaningful state is exposed as text.
- No text is allowed to appear before the main decision that a visitor would
  have to read as a paragraph. There is a word budget on the pre-decision copy
  and it is checked.

## Assignment 1: what building this taught the harness

Rules earned the hard way. Each one is here because it caught something, or
because not having it cost hours.

- **A result must be horizon-invariant, and that is a gate.** Re-run any
  configuration over a longer horizon and require the same answer
  (`horizonCheck`). The within-window steady-state check is *not enough*: a
  configuration whose effect climbed +20% → +58% as the horizon grew passed the
  drift check on 6 of 10 seeds, because a slow monotone ramp looks flat inside
  any one window. A configuration that fails horizon invariance may not be
  quoted at all — not with a caveat, not as "approximately".
- **When an effect will not appear, measure the model before touching the
  demand.** Raising demand until the sign flips produces oversaturation, which
  looks exactly like the effect you wanted. `scripts/experiment.ts` has
  `--curve`, `--grid`, `--parkway`, `--throat`, `--learning`, `--capacity`,
  `--invariant` and `--pair` for this reason: every one of them was written to
  answer a question instead of guessing at an answer.
- **Suspect the route-choice dynamics before the traffic physics.** A symmetric
  network cannot have an asymmetric equilibrium. When shares came out north
  6% / south 34%, the learning was under-damped (θ too sharp, α too fast), not
  the physics broken — and the "+24% Braess effect" was that non-convergence.
  Asymmetry on a symmetric network is the tell.
- **A reference value has to be measured, not derived.** "Free flowing" against
  `length ÷ speed limit` made empty ring roads report *slowing*, because without
  overtaking a long road's mean time exceeds free flow even when deserted.
  References for anything the page words come from a near-empty run, checked in
  via `scripts/snapshot.ts`.
- **Numbers the page states come from a generated snapshot, and a test fails if
  it is stale.** Never hand-type a figure into copy, and never compute the claim
  in the visitor's browser — one live run is one sample and its average wanders
  by more than the effect.
- **Copy is a claim, so it is checked.** The lede once said traffic was bad while
  the page's own readout showed every road free-flowing. If prose asserts a
  number or a state, a test ties it to the measurement.
- **Look at the rendered page, not the code.** The preroll silently ran 6 of its
  900 seconds because the backgrounded-tab frame cap also clamped it; vehicles
  parked off-canvas rendered as stray dots; labels sat on the roads they named.
  All three were invisible in the source and obvious in a screenshot.
- **A test-only speed control must change wall time and nothing else.**
  `?speed=N` scales the wall-clock compression, never `dt`, the seed or the
  schedule — so a browser test watches the same 900 simulated seconds in 14
  seconds instead of 142.
- **Scope is guarded by a test, not by good intentions.** Every feature this
  project rejected would have arrived as a control, so `spec/page.test.ts`
  asserts one primary action, zero sliders, and a word budget on the copy before
  the decision. Adding a control means deleting an assertion, which is a decision
  you have to make on purpose.
- **Browser-level facts need a browser.** jsdom has no layout, so it reports a
  page as fine while it scrolls sideways at 390 px. The viewport, keyboard,
  resize-mid-interaction and payload checks run Playwright against `dist/`.
- **Stylelint's standard config rejects BEM.** `selector-class-pattern` is set
  explicitly in `.stylelintrc.json`; class names are lower-case, so a class built
  from a link id needs `.toLowerCase()`.

## Assignment 1: traps the redesign found

All five of these were invisible in the source and obvious the moment something
measured them.

- **`[hidden]` loses to any class that sets `display`.** It is a user-agent rule,
  so `.metric { display: flex }` beat it and the before/after figure sat on screen
  through the opening beat reading "— before you built it" before anything had
  been built. There is now a global `[hidden] { display: none !important }`.
- **One breakpoint, read by both sides.** The network arrangement was chosen in
  JavaScript from the measured aspect of the figure while CSS sized that figure
  from the viewport width. Capping the figure's height on a phone made its box
  landscape, so the phone silently switched to the desktop arrangement — the
  portrait network vanished on the one viewport it exists for. Both sides now read
  `NARROW_QUERY`.
- **A viewBox that does not match its container's aspect ratio letterboxes.**
  `preserveAspectRatio="meet"` quietly padded the drawing, which read as a band of
  dead paper under the map. Keep `VIEWBOX` and the figure's `aspect-ratio` in step.
- **Hiding a focused element drops focus to `<body>`.** The action button is
  hidden while the story plays itself, which stranded a keyboard visitor: their
  place was gone and Tab restarted from the top of the page. Hand focus somewhere
  deliberate first — here, the headline, which is what just changed.
- **Clamping a centred label's anchor does not stop it overflowing.** Text with
  `text-anchor: middle` spreads half its width either side, so the ring-road labels
  ran off a phone and rendered as "lorth Ring" and "5.6 kr". Measure `getBBox()`
  once per layout change and turn the anchor.

Two rules of judgement from the same pass:

- **Every number on screen must be the same number.** At one point the headline
  said 5:57, the chart caption said 6:05, and the finding said 5:48 — three
  figures, all captioned as the average commute, because one was a rolling window,
  one was frozen at the moment a beat opened, and one was live. Pick one quantity,
  put it in one place, and let the other elements describe shape rather than
  restate the total.
- **Copy is a claim and gets a check.** The opening line said the link was "about
  a minute quicker" when the measured empty-road saving is 31 seconds. A test now
  ties that phrase to the geometry.

## Assignment 1: rendering is not simulation

- **Interpolate between fixed steps; never render the raw state.** With a fixed
  `dt` the accumulator runs a whole number of steps per frame, so at 45× on a
  120Hz display it alternated one step, two steps, one step — and a car's apparent
  speed swung by 50% every frame while the physics underneath was perfectly even.
  Measured per car, frame-to-frame motion variation was CV 0.343; interpolating by
  `accumulator / dt` took it to 0.132. Snap rather than interpolate across a
  junction, where the previous position is on a different road. `?nointerp=1`
  brings the stutter back on demand, so the fix can be demonstrated rather than
  asserted.
- **The renderer may never be an input.** `prevPos`/`prevLeg` are written by the
  engine and read only by the view. If a rendering concern ever needs the physics
  to change, it is the wrong fix — a jerky picture is a rendering bug until proven
  otherwise, and it was one here.
- **Identify drawn objects by simulation id, not by draw order.** Pooling circles
  by draw order meant a given circle stood for a different car each frame as
  vehicles came and went, so its shade jumped for no reason and nothing on screen
  had a stable identity.
- **Every state declares what may be on screen.** The page was showing the
  network, the traffic, four metrics, a chart, a route table, the controls and the
  model note at once, so a visitor met the whole apparatus before they had a reason
  to care about any of it. A panel now appears at the moment it explains something
  and not before, and that list lives in `src/story.ts` next to the beat, not
  scattered through the controller.
- **A visually hidden equivalent is not subject to progressive disclosure.** The
  road-state list is the map for a screen-reader user, so it stays present the whole
  way through even while the visual panels come and go.
