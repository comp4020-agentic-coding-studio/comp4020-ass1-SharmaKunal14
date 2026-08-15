# Process overview

## What I built

**One More Road** is an interactive explainer of Braess's paradox. A town has two
routes to work; a new connector appears to shorten the trip. You build it, drivers
adapt, and the average commute becomes worse. Closing it lets the network recover.
Only then is the paradox named. The outcome comes from a seeded Intelligent Driver
Model simulation rather than a scripted animation.

## The moments that mattered

**1. My best result was fake, so I strengthened the harness.** Before implementation,
I made conservation, determinism and comparison fairness explicit in `PLAN.md`; the
first runner then checked conservation every step and generated both conditions from
one shared configuration. Those guards still accepted a **+23.9%** Braess effect.
Instead of treating that as success, I predicted the signature of a growing queue:
the result would change with observation length. It did — **+20.5% → +38.8% → +49.5%
→ +58.4%** — while the within-window steady-state check passed on 6 of 10 seeds. I
added `horizonCheck`, which reruns a candidate over a 1.75× horizon and rejects it if
the answer changes. Across the search grid, every Braess-positive candidate failed.
Measuring the streets' usable delay range then exposed the modelling error: the
original shortcut saved more time than congestion could stably add
([`4c473aa...8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/4c473aa...8171e40)).

**2. I turned down the bigger number.** The corrected network produced an effect of
about 4%. A proposed multi-lane-to-single-lane bottleneck could have enlarged it,
but it would also have changed the model's scope and introduced more parameters to
defend. I kept the simpler network because its evidence was bounded and auditable:
the sign was positive in all ten paired seed trials, eight met the steady-state
gate, the base configuration passed the horizon check, and a lower-demand control
made the same connector help. That is stronger than a dramatic single run, but it
is not a claim that every trial fully settled
([`8171e40...9ae0852`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/8171e40...9ae0852)).

**3. The page and experiment disagreed threefold, and the page was wrong.** The live
chart showed 54 seconds worse while the cold-start comparison showed 11.6. The live
story first settles the closed network, then opens the connector; the original
headless comparison started each condition independently. I changed the experiment
to measure the intervention actually shown. A longer-horizon gate then revealed
that its **+10.1%** warm-start penalty decayed to **+3.4%**. The page now distinguishes
the adjustment-period transient from the settled effect, and a test requires both
protocols to agree at equilibrium
([`c70f164`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/c70f164)).

**4. User criticism made me remove work, then fix the right layer.** My first
redesign still exposed eight named states, a route table and a trace. The user called
it information-heavy, so I replaced it with one stable editorial spread and five
internal states: decide, watch, verified verdict, recover, reveal. One button changes
the network; the network carries the explanation. The same critique called motion
abrupt but forbade changing the science to beautify it. Profiling showed the renderer
was displaying raw fixed-step positions, so I interpolated previous/current state by
`accumulator / dt` and keyed cars by stable IDs. A later audit found the live
completion-time average was right-truncated; watch mode now shows only observable
shortcut uptake, while **5:31 → 5:44** is reserved for the paired 280-trip cohort.
The phone action fits the first viewport, the 38% label resolves to **106/280 trips**,
and 79 checks cover both marking sizes, keyboard, resize, reduced motion and delayed
responses
([`5977880...ba26efc`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/5977880...ba26efc)).

Rules are in `CLAUDE.md`, prior commitments in `PLAN.md`, and the unedited working
record is in `notes/log.md`.
