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

`mise.toml` pins Node 24 and `package.json` pins pnpm 11.9.0. The current shell
uses those versions, so `pnpm check` and `pnpm check:evidence` run directly.
Using `mise exec --` remains valid and is the safest option on an unverified
machine. If a TypeScript script fails before doing any work, check `node
--version` before changing the script.

`PROCESS.md` and `reflections/assignment-1.md` are complete. The evidence check
may skip only its course-API lookup when the network is unavailable; that is not
proof that the deployed site is ready. Don't put a live-URL assertion in
`spec/*.test.ts`: that suite gates the first deployment. Verify the deployed URL
after shipping with a one-off request instead.

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
uses one transparent classroom network, one range slider, one deliberate
comparison action and one causal open/closed switch. Eighty dots
represent 4,000 drivers. Forty dots permanently originate on each old route;
every 100-driver slider step transfers one from each origin to the shortcut.
Dragging the slider updates the route ledger, town average, map and five visible
equations from the pure calculation in `src/braess.ts`.

Never present route membership and road load as if they are additive peers. The
top, shortcut and bottom route groups contain unique drivers and must sum to
4,000. A narrow-road label is instead a pass-through count: it combines the old
route using that road with the same shortcut group that also passes through the
other narrow road. Name every road, use “pass here” for road loads, and state
plainly that those overlapping road labels must not be added.

The opening must establish the experiment before presenting its formulas. Keep
three facts explicit and visually distinct: **Fixed** means the same 4,000 drivers
with one start and destination; **You control** means only the share using the
shortcut; **Your goal** means the lowest town-wide average. The three road-time
rules follow as immutable inputs. Do not make the visitor infer this contract from
the map or from arithmetic later in the page.

On wide screens, keep those three jobs spatially distinct: slider investigation on
the left, the persistent road map as the dominant centre surface, and live arithmetic
on the right. The right rail owns the current town comparison, route ledger and five
equations; the left rail owns only the task, milestones, slider and immediate guidance.
Below the wide-screen breakpoint they return to one column in the order map, controls,
arithmetic. Never shrink three columns until labels or equations collide.

The slider is a guided investigation, not a staged sequence. Its milestone rail
unlocks the exact **64.7-minute minimum at 500 shortcut users**, the **65-minute
break-even at 1,000**, and the paradox at 4,000. After the endpoint, the same slider
may move to 3,900 for one rescue attempt: the town improves to 79.1 minutes, while
the returning drivers face 84.5 minutes instead of the shortcut's 79. Route-ledger
and equation buttons may spotlight their corresponding roads and dots; these are
presentation filters only and must never change a calculation or driver allocation.

**One controlled comparison.** Reaching the endpoint must not move the viewport
or open the result automatically. It offers one compact comparison action; only
that deliberate action reveals an inline result chapter after the experiment.
The action belongs inside the slider panel, where the endpoint is reached. The
endpoint prompt is a narrow-rail component even on a wide screen: stack its
heading, explanation and full-width action vertically rather than using an
internal desktop column layout. Verify that exact state at both marking viewports.
The chapter must introduce **Braess's paradox** as its dominant heading before
explaining it.
The sticky map must end before this chapter begins; the two surfaces may never
overlap. The chapter shows that the same 4,000 drivers take 65 minutes with the
shortcut closed and 80 with it open, then explains why the bad state persists:
staying takes 80 minutes while leaving alone takes 85. Do not present `80 vs 85`
without the controlling `65 vs 80` comparison.

The open/closed switch must keep **Drivers locked: 4,000** visible and return to this
same map; never render a second simulation. Retract the connector, redistribute the
existing 80 dots, and show `80 → 65` beside the map. Do not add Play, Animate or
replay controls. Preserve focus and provide a link back to the result chapter after
the reversal.

Before adding anything, the question is *does this make the visitor understand
the central idea more strongly?* If not, delete it. Prefer deleting UI over
adding an explanatory control. There is no hidden traffic run, route learning,
randomness, staged chapter sequence, network editor, chart or claim about a real
city. The earlier microscopic simulator remains as process evidence but must not
be imported into the public page.

## Assignment 1: boundaries for the retained simulation

The earlier microscopic simulation is retained for process evidence and tests,
not as the delivered explanation. These rules still protect that historical
work, but they do not describe the arithmetic calculator in `src/braess.ts`.

- **Never hard-code the outcome.** There is no `time = f(flow)` latency
  function, and no branch anywhere that reads "if the connector is open". Travel
  time is only ever *measured* from vehicle trajectories. The connector is the
  fastest, emptiest link in the model; the harm happens on links that existed
  before it.
- **The control configuration is load-bearing.** The same engine must produce a
  configuration where the connector *helps*. If that test ever goes red, the
  engine has started hard-coding the answer — fix the engine, never the test.
- **One frozen config, one boolean apart.** The authoritative paired cold-start
  baseline and treatment share one `ExperimentConfig`; connector availability is
  their only treatment difference. The sequential live intervention instead
  measures disjoint departure cohorts and is labelled as adaptation, not as the
  same drivers observed twice.
- **Physics never sees a pixel.** Nothing under `src/sim/` or `src/experiment/`
  may import from `src/view/` or touch `document`, `window`, or any dimension.
  Positions are metres, time is seconds, geometry is normalised. Resizing must
  not be able to change a result.
- **Fixed timestep only.** The engine advances in fixed `dt` steps driven by an
  accumulator. Never integrate with a `requestAnimationFrame` delta: that makes
  the experiment a function of frame rate.
- **All randomness comes from the seeded stream.** A headless run freezes a
  finite seeded schedule before simulation; the live run extends the same stream
  append-only without changing its prefix. Paired cold starts therefore receive
  identical scheduled departures, parameter samples and departure-level route
  draws. `Math.random()` is banned outside tests.
- **A result with a growing queue is not a result.** Report a number only if the
  run reached steady state and no link's queue is growing monotonically.
  Otherwise report "inconclusive". Total origin demand need not be below the
  narrowest capacity of every possible link; route splitting matters. What must
  be demonstrated is that realised queues stay bounded and the result remains
  stable when the horizon grows.
- **Measure cohorts, not arrivals.** Average over the drivers who *departed*
  inside the measurement window, counted when they arrive. Averaging whoever
  happened to finish lets a growing queue flatter its own average by excluding
  its victims.
- **The effect is statistical.** It is claimed from usable runs across seeds,
  with spread plus attempted/usable/excluded counts reported. Unusable runs never
  enter the quoted aggregate, and no run is chosen because it looked good.

## Assignment 1: claims we are allowed to make

The network is made up and its numbers are an exact classroom calculation, not
a measurement of a real place and not a prediction about road building. “More
roads always make traffic worse” is false. The supported claim is narrower:
*in this stated network, a shortcut makes the quickest individual choice produce
a slower result for the whole group.* Keep all three visible rules beside the
experiment and keep every arithmetic step inspectable. Never describe 80 minutes as a
five-minute saving from the original 65-minute network; it is five minutes
better only than one driver leaving alone after the congested state exists.

The connector's zero-minute travel time is a simplifying classroom assumption,
not a discovered result. It must be stated in the rule card, labelled on the map
and included as `+ 0` in the shortcut equation. Never hide a model assumption to
make an equation look simpler.

## Assignment 1: verification that actually counts

- Run `pnpm check` before every commit; run `pnpm check:evidence` after changing
  `PROCESS.md`, the reflection or commit citations.
- Test the whole interaction at **1920×1080** and **390×844**, including the
  slider midpoint and endpoint, deliberate reveal and horizontal overflow.
- The public contract is one range input, three derived milestone unlocks, one rescue
  attempt on that same range, one endpoint comparison action, five focusable equations,
  three focusable route groups and one causal open/closed switch returning to the
  original map. There is no prediction survey and no staged Continue-button sequence.
  `spec/page.test.ts` makes that scope explicit.
- All displayed numbers must come from `calculateBraess`; browser tests check the
  start, midpoint and endpoint equations rather than only checking that values
  changed.
- The eighty decorative driver dots stay `aria-hidden` and are never created or
  removed during interaction. Their permanent `data-origin` and changing
  `data-route` make every two-dot transfer testable. The equivalent driver and dot
  counts remain visible in the route ledger; the summary is announced through the
  polite live region.
- Reduced motion shortens transitions without changing values or interaction.
- Built assets remain relative for the GitHub Pages subpath, and the page loads
  no third-party runtime resources.

## Assignment 1: historical simulator lessons retained as process evidence

These lessons explain earlier commits and the retained simulation tests. They are
not the contract of the delivered calculator.

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
- **Legacy simulation claims came from a generated snapshot.** A frozen snapshot
  and freshness test prevented one wandering live sample from becoming evidence.
  The delivered calculator is different: its exact values are intentionally
  computed in the browser from the two stated rules.
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
- **Scope is guarded by a test, not by good intentions.** The current
  `spec/page.test.ts` permits one range slider plus route/equation spotlights and the
  deliberate comparison controls, while rejecting a prediction survey and staged
  button sequence. Adding a control means changing that contract deliberately.
- **Browser-level facts need a browser.** jsdom has no layout, so it reports a
  page as fine while it scrolls sideways at 390 px. The viewport, keyboard,
  resize-mid-interaction and payload checks run Playwright against `dist/`.
- **Stylelint's standard config rejects BEM.** `selector-class-pattern` is set
  explicitly in `.stylelintrc.json`; class names are lower-case, so a class built
  from a link id needs `.toLowerCase()`.

## Assignment 1: historical interface traps retained as process evidence

All five of these were invisible in the source and obvious the moment something
measured them.

- **`[hidden]` loses to any class that sets `display`.** It is a user-agent rule,
  so `.metric { display: flex }` beat it and the before/after figure sat on screen
  through the opening beat reading "— before you built it" before anything had
  been built. The discarded staged interface needed an explicit override; the
  current reveal must continue to avoid any class rule that defeats `hidden`.
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

## Assignment 1: historical rendering lessons retained as process evidence

- **Match rendering to the clock that drives it.** A continuous `LiveRun.advance`
  clock may interpolate `prevPos → pos` by its fractional accumulator; snapping
  across a junction is still required because the previous point is on another
  road. The chapter controller instead advances batches of whole fixed steps to
  exact checkpoints, so it renders the current position with alpha `1`. Passing
  `stepAlpha` there would leave every paused vehicle one physics tick behind the
  metric because that internal accumulator is deliberately zero.
- **The renderer may never be an input.** `prevPos`/`prevLeg` are written by the
  engine and read only by the view. If a rendering concern ever needs the physics
  to change, it is the wrong fix — a jerky picture is a rendering bug until proven
  otherwise, and it was one here.
- **Identify drawn objects by simulation id, not by draw order.** Pooling circles
  by draw order meant a given circle stood for a different car each frame as
  vehicles came and went, so its shade jumped for no reason and nothing on screen
  had a stable identity.
- **Every checkpoint must earn its controls.** The discarded page once showed the
  network, traffic, four metrics, a chart, a route table and the model note at once.
  Its generic progression clicks hid causes instead of exposing them. The current
  page uses direct manipulation; its extra controls only inspect the same map, compare
  the endpoint or reverse the road while the driver count stays locked.
- **A visual explanation still needs a textual equivalent.** Decorative movement
  may be hidden from assistive technology only when the meaningful counts, route
  times and conclusion remain available as ordinary text.
