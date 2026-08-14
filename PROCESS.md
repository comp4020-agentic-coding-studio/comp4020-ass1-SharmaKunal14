# Process overview

## What I built

**One More Road** is an interactive explainer of Braess's paradox. A town has two
routes to work; a new link would obviously shorten the trip. You build it, drivers
re-route, and the average commute settles *worse*. Close it and it recovers. Only
then is the paradox named. The traffic is a real Intelligent Driver Model
simulation: the outcome is measured, not asserted.

## The moments that mattered

**1. My best result was fake, and the fix went in the harness.** I wrote the
conservation and fairness checks *before* the model, so its failures would arrive as
red checks, not as my judgement of a plausible number. Then it reported **+23.9%**
and none of them objected. Instead of banking it I asked what it would look like
if it were wrong: a growing queue depends on how long you watch. Re-run over
longer horizons it went **+20.5% → +38.8% → +49.5% → +58.4%**. My steady-state check
had passed on 6 of 10 seeds throughout, because a slow monotone ramp looks flat
inside any one window. So the correction went into the harness, not another attempt:
`horizonCheck`, re-run at a longer horizon, same answer required, as a *gate*.
Across the whole grid, every Braess-positive configuration failed it; every one that
passed showed the link *helping*. Diagnosing why meant measuring, not tuning: the
effect has to fit inside the street's congested-to-free-flow range, which caps it
near 13% at any demand
([`c7e1ad2...8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/c7e1ad2...8171e40)).

**2. I turned down the bigger number.** With the honest effect at about 4%, I was
offered a way to make it larger: model the streets as several lanes narrowing to a
single-lane bridge, widening the range a standing queue can occupy. It would
probably have worked. I said no, because I wanted the experiment to stay simple,
real and demonstrable — every parameter interpretable and every claim checkable. It
was also the same trap in new clothes: every larger effect so far had turned out to
be an artefact, and I had no reason to expect otherwise. What told me it was right
is that the small effect survives everything — worse on all ten seeds,
horizon-invariant, paired with a control where the same code makes the link help.
The dramatic version never survived once
([`8171e40...9ae0852`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/8171e40...9ae0852)).

**3. The page and the experiment disagreed threefold, and the page was wrong.** My
chart said the link cost 54 seconds; the experiment said 11.6. The live run had
settled — at a *different* equilibrium, because my headless comparison ran the open
case cold, nobody holding habits. That is not what building a road is. So I rewrote
it to do what the page does: settle closed, measure, open the link on the running
network, measure again. Then the gate failed *that* too — given twice the settling
time the effect fell from +10.1% to +3.4%. The +10% is a transient decaying to a
real equilibrium, so the page states both and says which is which
([`c70f164`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/c70f164)).

**4. The page's own readout caught my copy lying.** The lede read "Traffic is bad.
Surely another road would help." Then the readout showed every road free-flowing —
because a settled Braess effect *requires* spare capacity. The premise contradicted
the simulation, so the premise went, and a test now ties the lede's claim to the
measured baseline. It also added a scope guard with teeth — one primary action, zero
sliders, a word budget on the copy — because every rejected feature would have
arrived as a control
([`9ae0852`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/9ae0852)).
Rules in `CLAUDE.md`, prior commitments in `PLAN.md`, unedited record in
`notes/log.md`.
