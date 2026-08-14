# Process overview

## What I built

**One More Road** is an interactive explainer of Braess's paradox. A town has two
routes to work; a new link across the middle would obviously shorten the trip.
You build it, drivers gradually re-route, and the average commute settles
*worse* than before. Then you close it and watch it recover. Only then is the
paradox named. The traffic is a real microscopic simulation — Intelligent Driver
Model vehicles queueing behind narrow bridges — so the outcome is measured, never
asserted. There is no equation in the project that turns volume into delay.

## The moments that mattered

**1. I wrote the checks before the model.** The obvious order is to build the
simulation, then test it. I inverted it: conservation, determinism,
experimental-fairness and free-flow checks went in against an empty engine
([`18a5731`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/18a5731)),
because the rubric rewards diagnosis over retrying and I wanted the model's
failures arriving as red checks rather than as my own judgement of plausible
numbers. That decision paid for itself three times over in moment 2.

**2. My best result was fake, and the fix went in the harness.** The target
configuration reported **+23.9%** — a textbook Braess result. Instead of banking
it I re-ran the same configuration over a longer horizon: the effect grew
**+20.5% → +38.8% → +49.5% → +58.4%**. It was a queue still growing, so "worse"
only meant "watched for longer". My steady-state check had passed on 6 of 10
seeds while this happened, because a slow monotone ramp looks flat inside any one
window. So the correction went into the harness, not into another attempt: I
added `horizonCheck`, which re-runs a configuration over a 1.75× horizon and
requires the same answer, and made it a gate — a configuration that fails it may
not be quoted at all. Run against the whole parameter grid its verdict was total:
every Braess-positive configuration failed, every configuration that passed
showed the connector *helping*
([`8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/8171e40)).

**3. I diagnosed the model instead of tuning the demand.** With no effect
visible, the obvious move was to raise demand until the sign flipped. I measured
instead, and derived the design equation from the runs: the effect equals
`(t_parkway − t_connector) − t_street(D/2)`, so it has to fit inside the street's
congested-to-free-flow range. Measured, that range capped it at ~13% *at any
demand*, and the "worse" rows I had been about to celebrate were an oversaturated
network. Two more false positives died the same way — an origin queue that
blocked every route on one vehicle, and route learning so under-damped it settled
lopsided at north 6% / south 34% on a symmetric network. Damping it restored
symmetry and the effect vanished, confirming the +24% had been the learning
dynamics rather than the road
([`c7e1ad2...8171e40`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/compare/c7e1ad2...8171e40)).
The honest result is **+3.5%**, worse on all ten seeds, with a control case at
lower demand where the same code makes the link an improvement.

**4. The page's own readout caught my copy lying.** The lede read "Traffic is
bad. Surely another road would help." Then the per-road readout showed every road
free-flowing at baseline — because a settled Braess effect *requires* spare
capacity. The premise contradicted the simulation, so the premise went
([`9ae0852`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-SharmaKunal14/commit/9ae0852)),
and a test now ties the lede's "five and a half minutes" to the measured
baseline. The same commit added a scope guard with teeth — one primary action,
zero sliders — because every feature I rejected would have arrived as a control.
