# Process overview

## What I built

**One More Road** is an interactive explainer of Braess's paradox. A town has two
routes to work; a new connector appears to shorten the trip. You build it, drivers
adapt, and the average commute becomes worse. Closing it removes the shortcut from
new choices. Only then is the paradox named. The outcome comes from a seeded
Intelligent Driver Model simulation rather than a scripted animation.

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

**4. A polished interaction can still hide its meaning.** The user rejected my
collapsed Build/Close interface: one click started an opaque sequence instead of a
chaptered investigation. I kept one network and added actions:
trace both ways, draw the shortcut, predict the quiet result, watch choices, design a
fair comparison and inspect both bridges. Screenshots exposed three more failures.
Endpoint clicks made nothing connect; jargon and unexplained percentages hid the model;
the quiet result appeared without showing its calculation. I drew the route onscreen,
made shortcut cars larger and gold, renamed pauses for what they do, and split the quiet
test into saved starts, totals, division and subtraction. The page now shows arithmetic —
**46/90 ≈ 51%** during the illustration,
**106/280 ≈ 38%** in the complete replay, and **92 + 106 = 198** at Riverside — and
labels **5:05 → 4:34** honestly as a length-and-speed estimate rather than timed trips.
Browser tests traverse all seventeen states at both marking sizes, by keyboard, through
resize, reduced motion and delayed responses
([`5977880...0e85d1a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/5977880...0e85d1a)).

Rules are in `CLAUDE.md`, prior commitments in `PLAN.md`, and the unedited working
record is in `notes/log.md`.
