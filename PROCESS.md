# Process overview

## What I built

**One More Road** is an interactive explainer of Braess's paradox. A town has two
routes to work; a new link would obviously shorten the trip. You build it, drivers
re-route, and the average commute settles *worse*. Close it and it recovers. Only
then is the paradox named. The traffic is a real microscopic simulation —
Intelligent Driver Model cars queueing behind narrow bridges — so the outcome is
measured, not asserted: no equation turns volume into delay.

## The moments that mattered

**1. My best result was fake, and the fix went in the harness.** I wrote the conservation,
determinism and fairness checks *before* the model, so its failures would arrive as
red checks rather than as my judgement of plausible numbers. Then the target
reported **+23.9%** and none of them objected. Instead of banking it I
asked what the number would look like if it were wrong: a growing queue depends on
how long you watch. Re-run over longer horizons it went **+20.5% → +38.8% → +49.5% → +58.4%**. My steady-state check passed on 6 of 10
seeds throughout, because a slow monotone ramp looks flat inside any one window. So
the correction went into the harness, not another attempt —
`horizonCheck`, re-run at 1.75× horizon, same answer required, as a *gate*: fail it
and you may not be quoted. Across the whole parameter grid, every Braess-positive
configuration failed and every one that passed showed the link *helping*
([`8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/8171e40)).

**2. I measured the model instead of tuning the demand.** The obvious move was to raise
demand until the sign flipped. Instead I derived the design equation from measured
runs: the effect is `(t_ring − t_link) − t_street(D/2)`, so it must fit inside the
street's congested-to-free-flow range — capping it near 13% *at any demand*, and
proving the "worse" rows were oversaturation. Two more false positives died the same way:
an origin queue that blocked every route on one vehicle, and route learning so
under-damped it settled at north 6% / south 34% on a symmetric network. Damping it
restored symmetry and the effect vanished — so the +24% was the learning dynamics,
not the road
([`c7e1ad2...8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/c7e1ad2...8171e40)).

**3. The page and the experiment disagreed threefold, and the page was wrong.** My
chart said the link cost 54 seconds; the experiment said 11.6. The live run had settled
— at a *different* equilibrium, because my headless comparison ran the open case
cold, link always present, nobody holding habits. That is not what building a road
is. So I rewrote it to do what the page does: settle closed, measure, open the link
on the running network, re-learn, measure again. Then the
gate failed *that* too — given twice the settling time the effect fell from +10.1%
to +3.4%. The +10% is a real transient decaying to a real equilibrium, so the page
states both and says which is which, not the flattering one
([`c70f164`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/c70f164)).

**4. The page's own readout caught my copy lying.** The lede read "Traffic is bad.
Surely another road would help." Then the readout showed every road free-flowing —
because a settled Braess effect *requires* spare capacity. The premise contradicted
the simulation, so the premise went, and a test now ties the lede's "five and a half
minutes" to the measured baseline
([`9ae0852`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/9ae0852)).
It also added a scope guard with teeth — one primary action, zero sliders, a word
budget on the copy — because every feature I rejected would have arrived as a
control. These episodes' rules are in `CLAUDE.md`
([`0e450bc`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/0e450bc));
the unedited record behind them is `notes/log.md`.
