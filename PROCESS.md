# Process overview

## What I built

**One More Road** is a transparent, one-slider explainer of Braess's paradox. The
visitor moves 4,000 drivers onto a shortcut and watches both individual travel times
and the town average change. Three road rules and every arithmetic step stay visible;
there is no random or hidden calculation in the presented model.

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

**4. More explanation made the explanation worse.** The user described buttons causing
unexplained events. Chapters, predictions and evidence cards made the visitor learn a
simulator before learning the paradox, so I deleted that staged interface. The delivered
page uses three rules and one slider. Eighty persistent dots expose every transfer; three
landmarks unlock the **64.7-minute** minimum, **65-minute** break-even and **80-minute**
paradox. Moving back to 3,900 then reveals the trap: the town improves to **79.1**, but
returning drivers face **84.5** while staying takes **79**. Route and equation controls
spotlight the same map without changing it. The endpoint action names the paradox, and
an open/closed switch visibly locks the crowd at 4,000 while the original map reverses
**80 → 65**. Wide screens separate controls, map and calculations into three readable
columns; phones return them to one. Browser tests cover arithmetic, persistent dots,
focus, both marking viewports and reduced motion
([`5977880...d2790ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/5977880...d2790ce)).

Rules are in `CLAUDE.md`, prior commitments in `PLAN.md`, and the unedited working
record is in `notes/log.md`.
