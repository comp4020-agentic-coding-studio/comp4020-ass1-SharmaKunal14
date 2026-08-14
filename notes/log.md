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

## Sat 15 Aug — CP1, three false positives and the check that caught them

After the throat went in, the target gave **+23.9%**. It was wrong, and so were
the two results after it. The sequence is worth keeping because each fix was at a
different level.

**1. Global origin queue (real bug).** `admitWaiting` returned on the first
vehicle that could not get on, so a driver heading for an empty parkway waited
behind one queued for a full street. That made the origin a single server shared
by every route and quietly coupled routes sharing no road. Fixed to one queue per
road out of the origin. Barely moved the numbers, but it was wrong.

**2. Oversaturation dressed as an equilibrium.** Lengthening the horizon moved
the "effect" +20.5% → +38.8% → +49.5% → +58.4% while the settled fraction stayed
at ~6/10. The queue was growing the whole time; "worse" just meant "watched
longer". My within-window drift check *passed on 6 of 10 seeds* while this
happened, because a slow monotone ramp looks flat inside any one window.

So I added `horizonCheck`: run the same config over a 1.75× longer horizon and
require the same answer. It is the only honest test of an equilibrium, and it is
now a gate — a config that fails it may not be quoted at all. Run against the
whole grid, the verdict was total: **every Braess-positive configuration failed,
every configuration that passed showed the connector helping.** Disjoint regions,
not adjacent ones.

**3. Under-damped route learning (the real culprit).** The open equilibrium was
coming out lopsided — north 6% / south 34% on a perfectly symmetric network —
with one street at 90% of capacity. A symmetric network cannot have an asymmetric
equilibrium, so the learning was the suspect, not the physics. θ=0.04 over a 100s
cost gap is a 55:1 preference and α=0.3 moves a belief a third of the way on
every trip. Damping it (θ=0.015, α=0.1) restored symmetry to a 2-point gap, made
the runs horizon-invariant — and the effect disappeared.

I had also measured throat discharge directly and found it within 4% of nominal,
which killed my "effective capacity is much lower" hypothesis before I built
anything on it.

**The actual design error.** With learning that converges, the connector saved
116s of free-flow time while a street can only stably add tens of seconds of
delay. `budget = t_parkway − t_connector` is the street travel time the open
equilibrium drives towards, so it has to sit *inside* the street's stable elastic
range. Mine was 237s against a street that stably reaches ~160s. The shortcut was
too good to ever be overturned, and the only way to "get" the effect was to run
the model somewhere it had not converged.

Shortening the parkway from 8200 m to 5600 m fixes it. The result:

| | closed | open | Δ | 10 seeds |
| --- | --- | --- | --- | --- |
| target, 860 veh/h | 331.2s | 342.8s | **+3.5%** | mean +5.4%, sd 3.1%, 8/10 settled, all positive |
| control, 300 veh/h | 318.6s | 310.7s | **−2.5%** | mean −3.0%, sd 0.4%, 10/10 settled, all negative |

Same network, same engine, same code path, one number different: the sign flips.
That is the control case the brief asked for, and it is stronger than I planned
for — not "some other network behaves differently" but "this network's answer
depends on how much traffic there is".

The honest effect is **~12 seconds on a five-and-a-half minute commute**. Every
larger number I saw was an artefact. Open question for the direction of the
piece: whether 12s can carry the reveal, or whether the visible change has to be
the route shares (0% → 38% on the shortcut) with the seconds as the consequence.
