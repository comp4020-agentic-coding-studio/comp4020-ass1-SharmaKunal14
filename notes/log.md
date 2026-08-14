# Working log

Rough notes kept while building, so PROCESS.md can be curated from a real
record instead of reconstructed afterwards. Not part of the deployed site.

## Sat 15 Aug — CP1, the street's travel-time curve

First run of the target config gave **−1.2%**: the connector *helped*. Control
gave −11.1%, which is the direction a control should go, so the engine was
working — the target was simply not a Braess configuration.

The obvious move was to raise demand until the sign flipped. `--curve` shows why
that would have been fraud:

```
demand   closed SA flow / t_SA    open SA flow / t_SA    journey
   400       198 / 112s               315 / 119s         334 → 294  better
  1000       527 / 135s               752 / 138s         360 → 356  better
  1200       545 / 140s               774 / 143s         405 → 472  WORSE
  1400       540 / 140s               774 / 142s         480 → 595  WORSE (unusable)
```

SA's flow saturates at ~770 veh/h and its travel time at ~143s. Beyond that,
extra demand does not go onto the street — it queues at the origin. So the
"WORSE" rows are an oversaturated network, not a worse equilibrium. Raising
demand would have produced exactly the artefact I wrote a steady-state check to
catch, and at 1200 the drift check *passed*, so the check alone would not have
saved me. The curve did.

Wrote down the design equation from the run rather than from intuition. In the
open equilibrium all three routes cost the same, which pins the street at
`t_street = t_parkway − t_connector`; the closed equilibrium costs
`t_street(D/2) + t_parkway`. So

    effect = (t_parkway − t_connector) − t_street(D/2)

and the whole effect has to fit inside the street's congested-to-free-flow
range. With `r = t_sat / t_freeflow`, the ceiling is `(r − 1)/(r + 1)`. Measured
r = 143/108 = 1.32, so **the effect was capped at ~13% at any demand**, and my
parkway was asking for 166s of budget from a street that can only spend 35s.

Root cause: a homogeneous link has no bottleneck inside it. It runs at free flow
below capacity and spills back past its own entrance above it, so its own
traversal time barely moves. Fix at the model level, using the mechanism the
source paper uses itself — Treiber et al. describe capacity changes as local
variations of a model parameter, and report that a parameter-induced local
capacity drop behaves like an on-ramp. So: the streets get a narrow throat near
the junction. A queue then forms *upstream of the throat, inside the street*,
and the street's traversal time can rise by a factor of 2–3 while still being a
stable equilibrium rather than a spillback.

Bonus, and it matters for the explanation: the queue now has a *visible
location*. The bottleneck is a place on the map, not an abstraction.
