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

**3. A CI timeout exposed both a real interaction bug and a brittle test.** Closing
the shortcut moved keyboard focus to `mapProof`, but `toggleRoad` always scrolled
`networkWrap`, so focus and the visible destination could disagree. Step logging
isolated the timeout to the geometry check. After making the handler scroll the
focused destination, `mapProof` remained slightly offset from the top because the
browser had reached its available scroll range: the page was not frozen, the test
was waiting for exact alignment the browser could not guarantee. I fixed the
interaction, then changed the test to require the result be visible rather than
positioned at an exact pixel
([`98a7a85`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/98a7a85)).

**4. More explanation made the explanation worse.** The user said buttons caused
unexplained events. Chapters, predictions and evidence cards forced the visitor to learn
a simulator before the paradox, so I deleted the staged interface. The delivered page
uses three rules and one slider; eighty persistent dots expose every transfer. Three
landmarks unlock the **64.7-minute** minimum, **65-minute** break-even and **80-minute**
paradox. Moving back to 3,900 reveals the trap: the town improves to **79.1**, but returning
drivers face **84.5** while staying takes **79**. Route and equation controls spotlight the
same map without changing calculations. A screenshot exposed another failure:
correct `2,350` road loads looked like `2,350 × 2 + 700` drivers. Rather than hide a
causal road, I separated unique route groups from overlapping pass-through counts, wrote
`1,650 old + same 700 shortcut`, and added arrows for the sole shortcut path. The endpoint
names the paradox; a switch holds 4,000 drivers while the same map reverses **80 → 65**.
Browser tests bind arithmetic, 80 dots, SVG label bounds, keyboard, both viewports and
reduced motion
([`5977880...d2790ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/5977880...d2790ce),
[`4a37ad0...9c0bf02`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/4a37ad0...9c0bf02)).

Rules are in `CLAUDE.md`, prior commitments in `PLAN.md`, and the running working
record is in `notes/log.md`.
